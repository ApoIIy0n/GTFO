var gtfoCurrentPageUrl = '';
var gtfoCurrentReportData = null;
var gtfoSyntaxHighlightCache = new Map();
var gtfoSyntaxHighlightCacheLimit = 20000;
var gtfoWorker = null;
var gtfoWorkerRequestId = 0;
var gtfoWorkerRequests = new Map();

function gtfoGetWorker() {
	if (gtfoWorker || typeof Worker != 'function')
		return gtfoWorker;

	try {
		gtfoWorker = new Worker(browser.runtime.getURL('js/grabber-worker.js'));
		gtfoWorker.addEventListener('message', (event) => {
			var response = event.data || {};
			var pending = gtfoWorkerRequests.get(response.id);
			if (!pending)
				return;

			gtfoWorkerRequests.delete(response.id);
			if (response.ok)
				pending.resolve(response.result);
			else
				pending.reject(new Error(response.error || 'Worker task failed.'));
		});
		gtfoWorker.addEventListener('error', (event) => {
			for (let pending of gtfoWorkerRequests.values())
				pending.reject(new Error(event.message || 'Worker failed.'));
			gtfoWorkerRequests.clear();
			gtfoWorker = null;
		});
	}
	catch (error) {
		console.warn('GTFO worker unavailable, falling back to main thread.', error);
		gtfoWorker = null;
	}

	return gtfoWorker;
}

function gtfoRunWorkerTask(type, payload, transfer) {
	var worker = gtfoGetWorker();
	if (!worker)
		return Promise.reject(new Error('Worker unavailable.'));

	var id = ++gtfoWorkerRequestId;
	return new Promise((resolve, reject) => {
		gtfoWorkerRequests.set(id, { resolve: resolve, reject: reject });
		worker.postMessage({
			id: id,
			type: type,
			payload: payload
		}, transfer || []);
	});
}

async function gtfoAnalyzeSourceInWorker(rawSource, sourceType, prettifySource, selectedComments, scrollComment) {
	var source = prettifySource ? gtfoFormatSource(rawSource, sourceType) : rawSource;

	try {
		return await gtfoRunWorkerTask('analyzeSource', {
			source: source,
			sourceType: sourceType,
			prettify: false,
			selectedComments: selectedComments || [],
			scrollComment: scrollComment || ''
		});
	}
	catch (error) {
		var lines = source.split(/\r?\n/);
		return {
			source: source,
			lines: lines,
			highlightedLines: lines.map((line) => gtfoHighlightSyntax(line, sourceType) || ' '),
			selectedLineIndexes: Array.from(gtfoBuildCommentLineSet(lines, selectedComments || [], sourceType)),
			scrollRange: gtfoFindCommentRange(lines, scrollComment, sourceType),
			foldRanges: Array.from(gtfoBuildFoldRanges(lines, sourceType).entries())
		};
	}
}

async function gtfoHashBlobInWorker(blob) {
	var buffer = await blob.arrayBuffer();

	try {
		return await gtfoRunWorkerTask('hashBuffer', {
			buffer: buffer
		}, [buffer]);
	}
	catch (error) {
		return {
			md5: await gtfoMd5Blob(blob),
			sha1: await gtfoHashBlob(blob, 'SHA-1'),
			sha256: await gtfoHashBlob(blob, 'SHA-256')
		};
	}
}

function gtfoEscapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function gtfoGetHost(data) {
	try {
		return data.host || data.html.name || new URL(data.pageUrl || data.url).hostname;
	}
	catch (error) {
		return data.title || 'Page';
	}
}

function gtfoGetPageUrl(data) {
	return data.pageUrl || data.url || '';
}

function gtfoGetUrls(data) {
	var urls = [];

	if (Array.isArray(data.urls))
		urls = urls.concat(data.urls);

	if (Array.isArray(data.js))
		urls = urls.concat(data.js.map((item) => item.url).filter((url) => url && !gtfoIsPageScriptUrl(url)));

	if (Array.isArray(data.css))
		urls = urls.concat(data.css.map((item) => item.url));

	if (Array.isArray(data.images))
		urls = urls.concat(data.images.map((image) => gtfoGetImageUrl(image)));

	urls = urls.filter((url) => !!url);
	urls = [...new Set(urls)];
	urls.sort();
	return urls;
}

function gtfoGetAssetOrigin(url, pageUrl) {
	try {
		return new URL(url, pageUrl).origin;
	}
	catch (error) {
		return '';
	}
}

function gtfoGetAssetPath(url, pageUrl) {
	if (!url)
		return 'Inline';

	try {
		var assetUrl = new URL(url, pageUrl);
		var pageOrigin = gtfoGetAssetOrigin(pageUrl, pageUrl);
		return assetUrl.origin == pageOrigin ? `${assetUrl.pathname}${assetUrl.search || ''}` : assetUrl.href;
	}
	catch (error) {
		return url;
	}
}

function gtfoGetAssetScope(url, pageUrl) {
	if (!url)
		return 'inline';

	return gtfoGetAssetOrigin(url, pageUrl) == gtfoGetAssetOrigin(pageUrl, pageUrl) ? 'same-origin' : 'third-party';
}

function gtfoIsPageScriptUrl(url) {
	return String(url || '').toLowerCase() == 'page';
}

function gtfoGetCommentGroups(data) {
	var groups = [];
	var pageUrl = gtfoGetPageUrl(data);

	if (data.html)
		groups.push({
			title: `HTML: ${data.html.name || 'Page'}`,
			source: data.html.source || data.pageHtml || '',
			comments: data.html.comments || [],
			sourceType: 'html',
			sourceScope: 'page',
			displayName: data.html.name || 'Page'
		});
	else if (data.comments)
		groups.push({
			title: 'HTML',
			source: data.pageHtml || '',
			comments: data.comments.html || [],
			sourceType: 'html',
			sourceScope: 'page',
			displayName: 'Page'
		});

	if (Array.isArray(data.js)) {
		for (let script of data.js) {
			let scope = gtfoIsPageScriptUrl(script.url) ? 'page' : gtfoGetAssetScope(script.url, pageUrl);
			groups.push({
				title: `JavaScript: ${script.url || 'Page'}`,
				source: script.source || '',
				comments: script.comments || [],
				sourceType: 'javascript',
				sourceScope: scope,
				displayName: scope == 'page' ? '/page' : (scope == 'inline' ? 'Inline Script' : gtfoGetAssetPath(script.url, pageUrl)),
				url: script.url || ''
			});
		}
	}
	else if (data.comments) {
		groups.push({
			title: 'JavaScript',
			source: '',
			comments: data.comments.javascript || [],
			sourceType: 'javascript',
			sourceScope: 'inline',
			displayName: 'Inline Script'
		});
	}

	if (Array.isArray(data.css)) {
		for (let stylesheet of data.css) {
			let scope = gtfoGetAssetScope(stylesheet.url, pageUrl);
			groups.push({
				title: `CSS: ${stylesheet.url || 'Stylesheet'}`,
				source: stylesheet.source || '',
				comments: stylesheet.comments || [],
				sourceType: 'css',
				sourceScope: scope == 'inline' ? 'same-origin' : scope,
				displayName: gtfoGetAssetPath(stylesheet.url, pageUrl),
				url: stylesheet.url || ''
			});
		}
	}

	return groups;
}

function gtfoGetSourceType(group) {
	if (group.sourceType)
		return group.sourceType;
	if (group.title.startsWith('HTML:'))
		return 'html';
	if (group.title.startsWith('CSS:'))
		return 'css';
	return 'javascript';
}

function gtfoPlural(value, singular, plural) {
	return `${value} ${value == 1 ? singular : plural}`;
}

function gtfoHighlightSyntax(line, sourceType) {
	line = String(line || '');
	var cacheable = line.length <= 2000;
	var cacheKey = cacheable ? `${sourceType}\n${line}` : '';
	if (cacheable && gtfoSyntaxHighlightCache.has(cacheKey))
		return gtfoSyntaxHighlightCache.get(cacheKey);

	var language = sourceType == 'html' ? 'xml' : sourceType;
	var highlighted = '';

	try {
		if (typeof hljs == 'object' && hljs.getLanguage(language))
			highlighted = hljs.highlight(line, { language: language, ignoreIllegals: true }).value;
	}
	catch (error) {
		console.warn('GTFO highlighter failed, showing escaped source.', error);
	}

	if (!highlighted)
		highlighted = gtfoEscapeHtml(line);

	if (cacheable) {
		if (gtfoSyntaxHighlightCache.size >= gtfoSyntaxHighlightCacheLimit)
			gtfoSyntaxHighlightCache.clear();
		gtfoSyntaxHighlightCache.set(cacheKey, highlighted);
	}

	return highlighted;
}


function gtfoDecodeHtmlEntity(entity) {
	var namedEntities = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: '\u00a0'
	};

	if (entity[1] == '#') {
		var isHex = entity[2] == 'x' || entity[2] == 'X';
		var codePoint = parseInt(entity.slice(isHex ? 3 : 2, -1), isHex ? 16 : 10);

		if (Number.isFinite(codePoint))
			return String.fromCodePoint(codePoint);

		return entity;
	}

	var name = entity.slice(1, -1);
	return Object.prototype.hasOwnProperty.call(namedEntities, name) ? namedEntities[name] : entity;
}

function gtfoAppendHighlightedHtml(parent, html) {
	var stack = [parent];
	var tokenPattern = /<\/span>|<span\s+class="([^"]*)">|&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);|[^<&]+|[<&]/g;
	var match;

	while ((match = tokenPattern.exec(String(html || ''))) !== null) {
		var token = match[0];
		var current = stack[stack.length - 1];

		if (token == '</span>') {
			if (stack.length > 1)
				stack.pop();
			else
				current.appendChild(document.createTextNode(token));
		}
		else if (token.startsWith('<span')) {
			var classes = String(match[1] || '')
				.split(/\s+/)
				.filter((className) => /^hljs[-_a-zA-Z0-9]*$/.test(className));

			if (classes.length > 0) {
				var span = document.createElement('span');
				span.className = classes.join(' ');
				current.appendChild(span);
				stack.push(span);
			}
		}
		else if (token[0] == '&')
			current.appendChild(document.createTextNode(gtfoDecodeHtmlEntity(token)));
		else
			current.appendChild(document.createTextNode(token));
	}
}

function gtfoSetHighlightedSyntax(element, html) {
	element.replaceChildren();
	gtfoAppendHighlightedHtml(element, html || ' ');
}

function gtfoGetCommentLines(comment, sourceType) {
	return String(comment || '')
		.split(/\r?\n/)
		.map((line) => gtfoNormalizeCommentLine(line, sourceType))
		.filter((line) => line.length > 0);
}

function gtfoNormalizeCommentLine(value, sourceType) {
	var line = String(value || '')
		.replace(/<!--/g, '')
		.replace(/-->/g, '')
		.trim();

	if (sourceType == 'html')
		return line;

	return line
		.replace(/^\/\*/g, '')
		.replace(/\*\/$/g, '')
		.replace(/^\/\//g, '')
		.replace(/^\s*\*/g, '')
		.trim();
}

function gtfoNormalizeCommentText(value, sourceType) {
	return String(value || '')
		.split(/\r?\n/)
		.map((line) => gtfoNormalizeCommentLine(line, sourceType))
		.join('\n')
		.trim();
}

function gtfoSourceLineMatchesCommentLine(sourceLine, commentLine, sourceType) {
	var sourceTrimmed = gtfoNormalizeCommentText(sourceLine, sourceType);
	var commentTrimmed = gtfoNormalizeCommentText(commentLine, sourceType);

	return sourceTrimmed == commentTrimmed || sourceTrimmed.includes(commentTrimmed);
}

function gtfoWindowContainsComment(windowLines, commentLines, sourceType) {
	var windowText = gtfoNormalizeCommentText(windowLines.join('\n'), sourceType);
	var searchIndex = 0;

	for (let commentLine of commentLines) {
		var nextIndex = windowText.indexOf(commentLine, searchIndex);
		if (nextIndex < 0)
			return false;

		searchIndex = nextIndex + commentLine.length;
	}

	return true;
}

function gtfoFindHtmlCommentRange(lines, comment) {
	var normalizedComment = gtfoNormalizeCommentText(comment, 'html');
	if (!normalizedComment)
		return null;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		if (!String(lines[lineIndex]).includes('<!--'))
			continue;

		var commentLines = [];
		var endIndex = lineIndex;

		for (; endIndex < lines.length; endIndex++) {
			commentLines.push(lines[endIndex]);
			if (String(lines[endIndex]).includes('-->'))
				break;
		}

		var normalizedSourceComment = gtfoNormalizeCommentText(commentLines.join('\n'), 'html');
		if (normalizedSourceComment == normalizedComment || normalizedSourceComment.includes(normalizedComment))
			return {
				start: lineIndex,
				end: endIndex
			};
	}

	return null;
}

var gtfoCodeCommentRangeCache = new WeakMap();

function gtfoGetCodeCommentRanges(lines, sourceType) {
	var cachedRangesByType = gtfoCodeCommentRangeCache.get(lines);
	if (cachedRangesByType && cachedRangesByType[sourceType])
		return cachedRangesByType[sourceType];

	var ranges = [];
	var state = 'code';
	var stringReturnState = 'code';
	var regexReturnState = 'code';
	var regexInCharacterClass = false;
	var templateExpressionDepth = 0;
	var blockStartLine = 0;
	var blockText = '';

	function cacheRanges() {
		cachedRangesByType = cachedRangesByType || {};
		cachedRangesByType[sourceType] = ranges;
		gtfoCodeCommentRangeCache.set(lines, cachedRangesByType);
		return ranges;
	}

	function isEscaped(line, index) {
		var slashCount = 0;
		for (let scanIndex = index - 1; scanIndex >= 0 && line[scanIndex] == '\\'; scanIndex--)
			slashCount++;
		return slashCount % 2 == 1;
	}

	function canStartRegex(line, index) {
		var scanIndex = index - 1;
		while (scanIndex >= 0 && /\s/.test(line[scanIndex]))
			scanIndex--;

		if (scanIndex < 0)
			return true;

		var previous = line[scanIndex];
		if ('([{=,:;!~?&|^+-*%<>}'.includes(previous))
			return true;

		if (/[a-zA-Z0-9_$]/.test(previous)) {
			var endIndex = scanIndex + 1;
			while (scanIndex >= 0 && /[a-zA-Z0-9_$]/.test(line[scanIndex]))
				scanIndex--;

			var previousWord = line.slice(scanIndex + 1, endIndex);
			return /^(?:return|throw|case|delete|void|typeof|new|yield|await|else|do|in|of)$/.test(previousWord);
		}

		return false;
	}

	function enterRegex(returnState) {
		regexReturnState = returnState;
		regexInCharacterClass = false;
		state = 'regex';
	}

	function returnToCodeState() {
		return sourceType == 'javascript' && templateExpressionDepth > 0 ? 'template-expression' : 'code';
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		var line = String(lines[lineIndex] || '');

		if (state == 'block-comment' && lineIndex > blockStartLine)
			blockText += '\n';

		for (let index = 0; index < line.length; index++) {
			var character = line[index];
			var nextCharacter = line[index + 1];

			if (state == 'code') {
				if (character == '"' || character == "'") {
					stringReturnState = 'code';
					state = character;
				}
				else if (sourceType == 'javascript' && character == '`')
					state = 'template';
				else if (sourceType == 'javascript' && character == '/' && nextCharacter == '/' && !isEscaped(line, index)) {
					ranges.push({
						start: lineIndex,
						end: lineIndex,
						text: line.slice(index)
					});
					break;
				}
				else if (character == '/' && nextCharacter == '*' && !isEscaped(line, index)) {
					blockStartLine = lineIndex;
					blockText = '/*';
					state = 'block-comment';
					index++;
				}
				else if (sourceType == 'javascript' && character == '/' && canStartRegex(line, index))
					enterRegex('code');
			}
			else if (state == '"' || state == "'") {
				if (character == state && !isEscaped(line, index))
					state = stringReturnState;
			}
			else if (state == 'template') {
				if (character == '`' && !isEscaped(line, index))
					state = 'code';
				else if (character == '$' && nextCharacter == '{' && !isEscaped(line, index)) {
					templateExpressionDepth = 1;
					state = 'template-expression';
					index++;
				}
			}
			else if (state == 'template-expression') {
				if (character == '"' || character == "'") {
					stringReturnState = 'template-expression';
					state = character;
				}
				else if (character == '`')
					state = 'template';
				else if (character == '{')
					templateExpressionDepth++;
				else if (character == '}') {
					templateExpressionDepth--;
					if (templateExpressionDepth <= 0)
						state = 'template';
				}
				else if (character == '/' && nextCharacter == '/' && !isEscaped(line, index)) {
					ranges.push({
						start: lineIndex,
						end: lineIndex,
						text: line.slice(index)
					});
					break;
				}
				else if (character == '/' && nextCharacter == '*' && !isEscaped(line, index)) {
					blockStartLine = lineIndex;
					blockText = '/*';
					state = 'block-comment';
					index++;
				}
				else if (character == '/' && canStartRegex(line, index))
					enterRegex('template-expression');
			}
			else if (state == 'regex') {
				if (character == '[' && !isEscaped(line, index))
					regexInCharacterClass = true;
				else if (character == ']' && !isEscaped(line, index))
					regexInCharacterClass = false;
				else if (character == '/' && !regexInCharacterClass && !isEscaped(line, index))
					state = regexReturnState;
			}
			else if (state == 'block-comment') {
				blockText += character;
				if (character == '*' && nextCharacter == '/') {
					blockText += '/';
					ranges.push({
						start: blockStartLine,
						end: lineIndex,
						text: blockText
					});
					blockText = '';
					state = returnToCodeState();
					index++;
				}
			}
		}

		if (state == 'regex')
			state = regexReturnState;
	}

	return cacheRanges();
}

function gtfoFindCodeCommentRange(lines, comment, sourceType) {
	var normalizedComment = gtfoNormalizeCommentText(comment, sourceType);
	if (!normalizedComment)
		return null;

	for (let range of gtfoGetCodeCommentRanges(lines, sourceType)) {
		var normalizedSourceComment = gtfoNormalizeCommentText(range.text, sourceType);
		if (normalizedSourceComment == normalizedComment || normalizedSourceComment.includes(normalizedComment))
			return {
				start: range.start,
				end: range.end
			};
	}

	return null;
}

function gtfoIsCommentWrapperLine(line) {
	var trimmed = String(line || '').trim();

	return /^(?:<!--|-->|\/\*+|\*\/|\*)$/.test(trimmed);
}

function gtfoExpandCommentRange(lines, range) {
	var start = range.start;
	var end = range.end;

	while (start > 0 && gtfoIsCommentWrapperLine(lines[start - 1]))
		start--;

	while (end < lines.length - 1 && gtfoIsCommentWrapperLine(lines[end + 1]))
		end++;

	return {
		start: start,
		end: end
	};
}

function gtfoFindCommentRange(lines, comment, sourceType) {
	if (sourceType == 'html')
		return gtfoFindHtmlCommentRange(lines, comment);
	if (sourceType == 'javascript' || sourceType == 'css')
		return gtfoFindCodeCommentRange(lines, comment, sourceType);

	var commentLines = gtfoGetCommentLines(comment, sourceType);
	if (commentLines.length == 0)
		return null;

	for (let lineIndex = 0; lineIndex <= lines.length - commentLines.length; lineIndex++) {
		var matches = true;

		for (let commentIndex = 0; commentIndex < commentLines.length; commentIndex++) {
			if (!gtfoSourceLineMatchesCommentLine(lines[lineIndex + commentIndex], commentLines[commentIndex], sourceType)) {
				matches = false;
				break;
			}
		}

		if (matches)
			return gtfoExpandCommentRange(lines, {
				start: lineIndex,
				end: lineIndex + commentLines.length - 1
			});
	}

	var maximumWindowSize = Math.max(commentLines.length + 6, 12);
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		var windowEnd = Math.min(lines.length, lineIndex + maximumWindowSize);

		for (let endIndex = lineIndex + 1; endIndex <= windowEnd; endIndex++) {
			if (gtfoWindowContainsComment(lines.slice(lineIndex, endIndex), commentLines, sourceType))
				return gtfoExpandCommentRange(lines, {
					start: lineIndex,
					end: endIndex - 1
				});
		}
	}

	return null;
}

function gtfoBuildCommentLineSet(lines, comments, sourceType) {
	var lineSet = new Set();

	for (let comment of comments) {
		var range = gtfoFindCommentRange(lines, comment, sourceType);
		if (!range)
			continue;

		for (let index = range.start; index <= range.end; index++)
			lineSet.add(index);
	}

	return lineSet;
}

function gtfoGetIndentWidth(line) {
	var match = String(line || '').match(/^[\t ]*/);
	var indent = 0;

	for (let character of match[0]) {
		if (character == '\t')
			indent += 2;
		else
			indent += 1;
	}

	return indent;
}

function gtfoLineCanStartFold(line, sourceType) {
	var trimmed = String(line || '').trim();
	if (!trimmed)
		return false;

	if (sourceType == 'html') {
		if (/^<\/|^<!|^<\?/.test(trimmed))
			return false;

		var tagMatch = trimmed.match(/^<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/);
		if (!tagMatch)
			return false;

		var tagName = tagMatch[1];
		return !tagMatch[0].endsWith('/>')
			&& !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName)
			&& !new RegExp(`</${tagName}>\\s*$`, 'i').test(trimmed);
	}

	return /[{[(]\s*(?:\/\/.*|\/\*.*\*\/)?$/.test(trimmed);
}

function gtfoBuildFoldRanges(lines, sourceType) {
	var ranges = new Map();

	for (let index = 0; index < lines.length - 1; index++) {
		if (!gtfoLineCanStartFold(lines[index], sourceType))
			continue;

		var indent = gtfoGetIndentWidth(lines[index]);
		var end = null;

		for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
			if (!String(lines[nextIndex]).trim())
				continue;

			if (gtfoGetIndentWidth(lines[nextIndex]) <= indent) {
				end = nextIndex - 1;
				break;
			}
		}

		if (end == null)
			end = lines.length - 1;

		if (end > index)
			ranges.set(index, end);
	}

	return ranges;
}

function gtfoFormatSource(source, sourceType) {
	var options = {
		indent_size: 2,
		indent_char: ' ',
		preserve_newlines: true,
		max_preserve_newlines: 2,
		brace_style: 'collapse'
	};

	try {
		if (sourceType == 'html' && typeof html_beautify == 'function')
			return html_beautify(source, options);

		if (sourceType == 'css' && typeof css_beautify == 'function')
			return css_beautify(source, {
				...options,
				selector_separator_newline: true,
				newline_between_rules: true
			});

		if (typeof js_beautify == 'function')
			return js_beautify(source, options);
	}
	catch (error) {
		console.warn('GTFO beautifier failed, showing original source.', error);
	}

	return source;
}

function gtfoScrollIntoViewIfNeeded(panel, element) {
	var panelRect = panel.getBoundingClientRect();
	var elementRect = element.getBoundingClientRect();

	if (elementRect.top < panelRect.top || elementRect.bottom > panelRect.bottom) {
		var targetTop = panel.scrollTop + (elementRect.top - panelRect.top) - (panel.clientHeight / 2) + (elementRect.height / 2);
		panel.scrollTop = Math.max(0, Math.min(targetTop, panel.scrollHeight - panel.clientHeight));
	}

	panel.scrollLeft = 0;
}

function gtfoSwitchTab(tabName) {
	document.querySelectorAll('.tabcontent').forEach((tab) => {
		tab.classList.toggle('tabcontent-active', tab.id == tabName);
	});
	document.querySelectorAll('.gtfo-tab-button').forEach((button) => {
		button.classList.toggle('gtfo-tab-button-active', button.dataset.tab == tabName);
	});
}

function gtfoSelectedUrls() {
	return Array.from(document.querySelectorAll('.gtfo-url-input:checked')).map((input) => input.value);
}

function gtfoClearElement(element) {
	element.replaceChildren();
}

function gtfoAppendReportMeta(container, title, url) {
	gtfoClearElement(container);

	var strong = document.createElement('strong');
	strong.textContent = title || '';

	var link = document.createElement('a');
	link.href = url || '#';
	link.textContent = url || '';

	container.appendChild(strong);
	container.append(' - ');
	container.appendChild(link);
}

function gtfoCreateToolButton(id, text) {
	var button = document.createElement('button');
	button.className = 'gtfo-tool-button';
	button.id = id;
	button.type = 'button';
	button.textContent = text;
	return button;
}

function gtfoCreateUrlToolbar() {
	var toolbar = document.createElement('div');
	toolbar.id = 'gtfo-urls-toolbar';

	toolbar.appendChild(gtfoCreateToolButton('gtfo-copy-urls', 'Copy'));
	toolbar.appendChild(gtfoCreateToolButton('gtfo-save-urls', 'Save'));

	var label = document.createElement('label');
	var checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.id = 'gtfo-select-all';
	label.appendChild(checkbox);
	label.append(' Select all');

	toolbar.appendChild(label);
	return toolbar;
}

function gtfoCreateUrlRow(url, index, total) {
	var row = document.createElement('div');
	row.className = 'gtfo-url-row';

	var input = document.createElement('input');
	input.className = 'gtfo-url-input';
	input.type = 'checkbox';
	input.value = url;

	var link = document.createElement('a');
	link.href = url;
	link.textContent = `${String(index + 1).padStart(String(total).length, '0')}: ${url}`;

	row.appendChild(input);
	row.appendChild(link);
	return row;
}

function gtfoCreateDropdown(id, toggleId, options, defaultValue) {
	var dropdown = document.createElement('div');
	dropdown.id = id;
	dropdown.className = 'gtfo-selection-dropdown';
	dropdown.dataset.value = defaultValue;

	var selectedOption = options.find((option) => option.value == defaultValue) || options[0];
	var longestLabel = options.reduce((longest, option) => option.label.length > longest.length ? option.label : longest, '');

	var toggle = document.createElement('button');
	toggle.type = 'button';
	toggle.id = toggleId;
	toggle.className = 'gtfo-source-action gtfo-selection-toggle';
	toggle.textContent = selectedOption ? selectedOption.label : '';
	toggle.style.width = `${Math.max(8, longestLabel.length + 6)}ch`;

	var menu = document.createElement('div');
	menu.className = 'gtfo-selection-menu';
	for (let optionData of options) {
		var option = document.createElement('button');
		option.type = 'button';
		option.value = optionData.value;
		option.textContent = optionData.label;
		menu.appendChild(option);
	}

	dropdown.appendChild(toggle);
	dropdown.appendChild(menu);
	return dropdown;
}

function gtfoCreateCommentLayout() {
	var layout = document.createElement('div');
	layout.id = 'gtfo-comments-layout';

	var nav = document.createElement('div');
	nav.id = 'gtfo-comments-nav';

	var sourcePanel = document.createElement('div');
	sourcePanel.id = 'gtfo-source-panel';

	var sourceTitle = document.createElement('div');
	sourceTitle.id = 'gtfo-source-title';

	var sourceTitleText = document.createElement('span');
	sourceTitleText.id = 'gtfo-source-title-text';

	var sourceActions = document.createElement('div');
	sourceActions.id = 'gtfo-source-actions';

	var prettifyButton = document.createElement('button');
	prettifyButton.type = 'button';
	prettifyButton.id = 'gtfo-prettify-source';
	prettifyButton.className = 'gtfo-source-action';
	prettifyButton.textContent = 'Prettify';
	sourceActions.appendChild(prettifyButton);

	var selectionMode = gtfoCreateDropdown('gtfo-selection-export-mode', 'gtfo-selection-export-toggle', [
		{ value: 'all', label: 'All selected' },
		{ value: 'red', label: 'Red' },
		{ value: 'green', label: 'Green' },
		{ value: 'orange', label: 'Orange' },
		{ value: 'cyan', label: 'Cyan' }
	], 'all');
	sourceActions.appendChild(selectionMode);

	var copySelectionsButton = document.createElement('button');
	copySelectionsButton.type = 'button';
	copySelectionsButton.id = 'gtfo-copy-source-selections';
	copySelectionsButton.className = 'gtfo-source-action';
	copySelectionsButton.textContent = 'Copy';
	sourceActions.appendChild(copySelectionsButton);

	var saveSelectionsButton = document.createElement('button');
	saveSelectionsButton.type = 'button';
	saveSelectionsButton.id = 'gtfo-save-source-selections';
	saveSelectionsButton.className = 'gtfo-source-action';
	saveSelectionsButton.textContent = 'Save';
	sourceActions.appendChild(saveSelectionsButton);

	var sourceCode = document.createElement('pre');
	sourceCode.id = 'gtfo-source-code';

	var sourceMarkers = document.createElement('div');
	sourceMarkers.id = 'gtfo-source-markers';
	var sourceSplitter = document.createElement('div');
	sourceSplitter.id = 'gtfo-source-splitter';
	sourceSplitter.title = 'Resize source panes';

	sourceTitle.appendChild(sourceTitleText);
	sourceTitle.appendChild(sourceActions);
	sourcePanel.appendChild(sourceTitle);
	sourcePanel.appendChild(sourceCode);
	sourcePanel.appendChild(sourceMarkers);

	var dock = document.createElement('div');
	dock.id = 'gtfo-source-dock';

	var dockResizer = document.createElement('div');
	dockResizer.id = 'gtfo-dock-resizer';
	dockResizer.title = 'Resize search panel';

	var dockTabs = document.createElement('div');
	dockTabs.id = 'gtfo-source-dock-tabs';
	var searchTab = document.createElement('button');
	searchTab.className = 'gtfo-dock-tab gtfo-dock-tab-active';
	searchTab.type = 'button';
	searchTab.textContent = 'Search';
	dockTabs.appendChild(searchTab);

	var dockBody = document.createElement('div');
	dockBody.id = 'gtfo-source-dock-body';
	var searchPanel = document.createElement('div');
	searchPanel.id = 'gtfo-source-search-panel';

	var searchControls = document.createElement('div');
	searchControls.id = 'gtfo-source-search-controls';
	var searchLabel = document.createElement('label');
	searchLabel.textContent = 'Search:';
	var searchScope = gtfoCreateDropdown('gtfo-source-search-scope', 'gtfo-source-search-scope-toggle', [
		{ value: 'current', label: 'Current source' },
		{ value: 'all', label: 'All' },
		{ value: 'html', label: 'HTML' },
		{ value: 'javascript', label: 'JS' },
		{ value: 'css', label: 'CSS' }
	], 'current');

	var searchInput = document.createElement('input');
	searchInput.id = 'gtfo-source-search-input';
	searchInput.type = 'search';
	searchInput.placeholder = 'Text or /regex/flags';

	var regexLabel = document.createElement('label');
	regexLabel.id = 'gtfo-source-search-regex-toggle';
	regexLabel.className = 'gtfo-search-toggle';
	var regexInput = document.createElement('input');
	regexInput.id = 'gtfo-source-search-regex';
	regexInput.type = 'checkbox';
	regexLabel.appendChild(regexInput);
	regexLabel.append(' Regex');

	var caseLabel = document.createElement('label');
	caseLabel.id = 'gtfo-source-search-case-toggle';
	caseLabel.className = 'gtfo-search-toggle';
	var caseInput = document.createElement('input');
	caseInput.id = 'gtfo-source-search-case';
	caseInput.type = 'checkbox';
	caseLabel.appendChild(caseInput);
	caseLabel.append(' Aa');

	var selectAllLabel = document.createElement('label');
	selectAllLabel.id = 'gtfo-source-search-select-all-toggle';
	selectAllLabel.className = 'gtfo-search-toggle';
	var selectAllInput = document.createElement('input');
	selectAllInput.id = 'gtfo-source-search-select-all';
	selectAllInput.type = 'checkbox';
	selectAllLabel.appendChild(selectAllInput);
	selectAllLabel.append(' Select all');

	searchControls.appendChild(searchLabel);
	searchControls.appendChild(searchScope);
	searchControls.appendChild(searchInput);
	searchControls.appendChild(regexLabel);
	searchControls.appendChild(caseLabel);
	searchControls.appendChild(selectAllLabel);

	var searchSummary = document.createElement('div');
	searchSummary.id = 'gtfo-source-search-summary';
	searchSummary.textContent = 'Enter a search query.';

	var searchResults = document.createElement('div');
	searchResults.id = 'gtfo-source-search-results';

	searchPanel.appendChild(searchControls);
	searchPanel.appendChild(searchSummary);
	searchPanel.appendChild(searchResults);
	dockBody.appendChild(searchPanel);
	dock.appendChild(dockResizer);
	dock.appendChild(dockBody);
	dock.appendChild(dockTabs);

	layout.appendChild(nav);
	layout.appendChild(sourceSplitter);
	layout.appendChild(sourcePanel);
	layout.appendChild(dock);

	return layout;
}

function gtfoBindSourceLayoutResizers() {
	var layout = document.getElementById('gtfo-comments-layout');
	var verticalSplitter = document.getElementById('gtfo-source-splitter');
	var dockResizer = document.getElementById('gtfo-dock-resizer');
	if (!layout || !verticalSplitter || !dockResizer)
		return;

	function clamp(value, minimum, maximum) {
		return Math.max(minimum, Math.min(maximum, value));
	}

	verticalSplitter.addEventListener('mousedown', (event) => {
		event.preventDefault();
		verticalSplitter.classList.add('gtfo-splitter-active');

		function onMove(moveEvent) {
			var rect = layout.getBoundingClientRect();
			var navWidth = clamp(moveEvent.clientX - rect.left, 240, rect.width - 360);
			layout.style.gridTemplateColumns = `${navWidth}px 6px minmax(300px, 1fr)`;
		}

		function onUp() {
			verticalSplitter.classList.remove('gtfo-splitter-active');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});

	dockResizer.addEventListener('mousedown', (event) => {
		event.preventDefault();
		dockResizer.classList.add('gtfo-splitter-active');

		function onMove(moveEvent) {
			var rect = layout.getBoundingClientRect();
			var dockHeight = clamp(rect.bottom - moveEvent.clientY, 120, rect.height - 180);
			layout.style.gridTemplateRows = `minmax(0, 1fr) ${dockHeight}px`;
		}

		function onUp() {
			dockResizer.classList.remove('gtfo-splitter-active');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});
}

function gtfoGetImageUrl(image) {
	return typeof image == 'string' ? image : image.url || image.src || '';
}

function gtfoGetImageExtensionFromUrl(url) {
	try {
		var pathname = new URL(url, gtfoCurrentPageUrl).pathname;
		var name = pathname.split('/').pop() || '';
		var match = name.match(/\.([a-z0-9]{2,5})$/i);
		return match ? match[1].toLowerCase() : '';
	}
	catch (error) {
		var cleanUrl = String(url || '').split('?')[0].split('#')[0];
		var match = cleanUrl.match(/\.([a-z0-9]{2,5})$/i);
		return match ? match[1].toLowerCase() : '';
	}
}

function gtfoGetImageType(image) {
	var type = typeof image == 'string' ? '' : String(image.type || '').trim();
	if (type.startsWith('image/'))
		return type.slice(6).toLowerCase().replace('jpeg', 'jpg');

	if (/^[a-z0-9]{2,5}$/i.test(type))
		return type.toLowerCase();

	return gtfoGetImageExtensionFromUrl(gtfoGetImageUrl(image)) || 'image';
}

function gtfoGetImageFileNameFromUrl(url) {
	try {
		var pathname = new URL(url, gtfoCurrentPageUrl).pathname;
		return decodeURIComponent(pathname.split('/').pop() || '');
	}
	catch (error) {
		return decodeURIComponent(String(url || '').split('?')[0].split('#')[0].split('/').pop() || '');
	}
}

function gtfoSanitizeFileName(value) {
	return String(value || '')
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
		.replace(/\s+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 180);
}

function gtfoGetImageDisplayName(image, fallbackName) {
	var explicitName = typeof image == 'string' ? '' : String(image.name || '').trim();
	var urlName = gtfoGetImageFileNameFromUrl(gtfoGetImageUrl(image));
	return gtfoSanitizeFileName(explicitName || urlName || fallbackName);
}

function gtfoEnsureImageExtension(fileName, type) {
	if (/\.[a-z0-9]{2,5}$/i.test(fileName))
		return fileName;

	return `${fileName}.${type || 'img'}`;
}

function gtfoGetImageDimensions(image) {
	if (typeof image == 'string')
		return '';

	if (image.width && image.height)
		return `${image.width} x ${image.height}`;

	return '';
}

function gtfoBuildImageDownloadName(host, imageInfo) {
	var type = gtfoGetImageType(imageInfo.image);
	var fileName = gtfoEnsureImageExtension(imageInfo.name, type);
	return `${gtfoSanitizeFileName(host || 'website')}_${fileName}`;
}

function gtfoFormatBytes(bytes) {
	if (!Number.isFinite(bytes))
		return '';

	var units = ['B', 'KB', 'MB', 'GB'];
	var value = bytes;
	var unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	return `${value.toFixed(unitIndex == 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function gtfoBufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function gtfoHashBlob(blob, algorithm) {
	var buffer = await blob.arrayBuffer();
	var digest = await crypto.subtle.digest(algorithm, buffer);
	return gtfoBufferToHex(digest);
}

function gtfoMd5Add(x, y) {
	return (((x & 0xffff) + (y & 0xffff)) + ((((x >>> 16) + (y >>> 16) + (((x & 0xffff) + (y & 0xffff)) >>> 16)) & 0xffff) << 16)) | 0;
}

function gtfoMd5RotateLeft(value, bits) {
	return (value << bits) | (value >>> (32 - bits));
}

function gtfoMd5Step(fn, a, b, c, d, x, shift, constant) {
	return gtfoMd5Add(gtfoMd5RotateLeft(gtfoMd5Add(gtfoMd5Add(a, fn(b, c, d)), gtfoMd5Add(x, constant)), shift), b);
}

async function gtfoMd5Blob(blob) {
	var bytes = new Uint8Array(await blob.arrayBuffer());
	var originalBitLength = bytes.length * 8;
	var paddedLength = (((bytes.length + 8) >>> 6) + 1) << 6;
	var padded = new Uint8Array(paddedLength);
	padded.set(bytes);
	padded[bytes.length] = 0x80;

	for (let index = 0; index < 8; index++)
		padded[paddedLength - 8 + index] = Math.floor(originalBitLength / Math.pow(2, 8 * index)) & 0xff;

	var a = 0x67452301;
	var b = 0xefcdab89;
	var c = 0x98badcfe;
	var d = 0x10325476;
	var shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
	var constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) | 0);

	for (let offset = 0; offset < padded.length; offset += 64) {
		var words = [];
		for (let index = 0; index < 16; index++) {
			var wordOffset = offset + index * 4;
			words[index] = padded[wordOffset] | (padded[wordOffset + 1] << 8) | (padded[wordOffset + 2] << 16) | (padded[wordOffset + 3] << 24);
		}

		var aa = a;
		var bb = b;
		var cc = c;
		var dd = d;

		for (let index = 0; index < 64; index++) {
			var fn;
			var wordIndex;
			var shift;

			if (index < 16) {
				fn = (x, y, z) => (x & y) | (~x & z);
				wordIndex = index;
				shift = shifts[index % 4];
			}
			else if (index < 32) {
				fn = (x, y, z) => (x & z) | (y & ~z);
				wordIndex = (5 * index + 1) % 16;
				shift = shifts[4 + (index % 4)];
			}
			else if (index < 48) {
				fn = (x, y, z) => x ^ y ^ z;
				wordIndex = (3 * index + 5) % 16;
				shift = shifts[8 + (index % 4)];
			}
			else {
				fn = (x, y, z) => y ^ (x | ~z);
				wordIndex = (7 * index) % 16;
				shift = shifts[12 + (index % 4)];
			}

			var temp = dd;
			dd = cc;
			cc = bb;
			bb = gtfoMd5Step(fn, aa, bb, cc, dd, words[wordIndex], shift, constants[index]);
			aa = temp;
		}

		a = gtfoMd5Add(a, aa);
		b = gtfoMd5Add(b, bb);
		c = gtfoMd5Add(c, cc);
		d = gtfoMd5Add(d, dd);
	}

	return [a, b, c, d].map((word) => {
		var hex = '';
		for (let index = 0; index < 4; index++)
			hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, '0');
		return hex;
	}).join('');
}

async function gtfoGetImageBlob(imageInfo) {
	if (imageInfo.blob)
		return imageInfo.blob;

	var response = await fetch(imageInfo.url);
	if (!response.ok)
		throw new Error(`HTTP ${response.status}`);

	imageInfo.headers = {
		contentType: response.headers.get('content-type') || '',
		contentLength: response.headers.get('content-length') || '',
		lastModified: response.headers.get('last-modified') || '',
		cacheControl: response.headers.get('cache-control') || '',
		etag: response.headers.get('etag') || ''
	};
	imageInfo.blob = await response.blob();
	return imageInfo.blob;
}

function gtfoAppendImageCard(parent, imageInfo) {
	var image = imageInfo.image;
	var imageUrl = gtfoGetImageUrl(image);
	var card = document.createElement('div');
	card.className = 'gtfo-image-card';

	var input = document.createElement('input');
	input.className = 'gtfo-image-select';
	input.type = 'checkbox';
	input.value = String(imageInfo.index);

	var img = document.createElement('img');
	img.src = imageUrl;
	img.alt = '';
	img.addEventListener('load', () => {
		if (!imageInfo.dimensions && img.naturalWidth && img.naturalHeight) {
			imageInfo.dimensions = `${img.naturalWidth} x ${img.naturalHeight}`;
			var dimensions = card.querySelector('.gtfo-image-dimensions');
			if (dimensions)
				dimensions.textContent = imageInfo.dimensions;
		}
	});

	var meta = document.createElement('div');
	meta.className = 'gtfo-image-meta';
	var link = document.createElement('a');
	link.href = imageUrl;
	link.textContent = imageInfo.name;

	var dimensions = document.createElement('span');
	dimensions.className = 'gtfo-image-dimensions';
	dimensions.textContent = imageInfo.dimensions || 'loading dimensions';

	var type = document.createElement('span');
	type.textContent = gtfoGetImageType(image);

	input.checked = !!imageInfo.selected;
	meta.appendChild(link);
	meta.appendChild(dimensions);
	meta.appendChild(type);
	card.appendChild(input);
	card.appendChild(img);
	card.appendChild(meta);
	parent.appendChild(card);
	return card;
}

function gtfoCreateImagesLayout() {
	var layout = document.createElement('div');
	layout.id = 'gtfo-images-layout';

	var toolbar = document.createElement('div');
	toolbar.id = 'gtfo-images-toolbar';

	var stage = document.createElement('div');
	stage.id = 'gtfo-images-stage';

	var previousButton = document.createElement('button');
	previousButton.className = 'gtfo-image-nav-button gtfo-image-nav-prev';
	previousButton.id = 'gtfo-images-prev';
	previousButton.type = 'button';
	previousButton.textContent = '<';

	var grid = document.createElement('div');
	grid.className = 'gtfo-image-grid';
	grid.id = 'gtfo-image-grid';

	var nextButton = document.createElement('button');
	nextButton.className = 'gtfo-image-nav-button gtfo-image-nav-next';
	nextButton.id = 'gtfo-images-next';
	nextButton.type = 'button';
	nextButton.textContent = '>';

	var pages = document.createElement('div');
	pages.id = 'gtfo-images-pages';

	var contextMenu = document.createElement('div');
	contextMenu.id = 'gtfo-image-context-menu';

	for (let action of [
		{ id: 'view', text: 'View' },
		{ id: 'save', text: 'Save' },
		{ id: 'copy', text: 'Copy' },
		{ id: 'inspect', text: 'Inspect' }
	]) {
		var item = document.createElement('button');
		item.className = 'gtfo-image-context-item';
		item.type = 'button';
		item.dataset.action = action.id;
		item.textContent = action.text;
		contextMenu.appendChild(item);
	}

	var infoOverlay = document.createElement('div');
	infoOverlay.id = 'gtfo-image-info-overlay';

	var infoDialog = document.createElement('div');
	infoDialog.id = 'gtfo-image-info-dialog';

	var infoTitle = document.createElement('div');
	infoTitle.id = 'gtfo-image-info-title';
	var infoTitleText = document.createElement('span');
	infoTitleText.id = 'gtfo-image-info-title-text';
	var closeButton = document.createElement('button');
	closeButton.className = 'gtfo-tool-button';
	closeButton.id = 'gtfo-image-info-close';
	closeButton.type = 'button';
	closeButton.textContent = 'Close';
	infoTitle.appendChild(infoTitleText);
	infoTitle.appendChild(closeButton);

	var infoText = document.createElement('textarea');
	infoText.id = 'gtfo-image-info-text';
	infoText.readOnly = true;

	var infoActions = document.createElement('div');
	infoActions.id = 'gtfo-image-info-actions';
	var copyInfoButton = document.createElement('button');
	copyInfoButton.className = 'gtfo-tool-button';
	copyInfoButton.id = 'gtfo-image-info-copy';
	copyInfoButton.type = 'button';
	copyInfoButton.textContent = 'Copy info';
	infoActions.appendChild(copyInfoButton);

	infoDialog.appendChild(infoTitle);
	infoDialog.appendChild(infoText);
	infoDialog.appendChild(infoActions);
	infoOverlay.appendChild(infoDialog);

	var viewOverlay = document.createElement('div');
	viewOverlay.id = 'gtfo-image-view-overlay';

	var viewDialog = document.createElement('div');
	viewDialog.id = 'gtfo-image-view-dialog';

	var viewCloseButton = document.createElement('button');
	viewCloseButton.id = 'gtfo-image-view-close';
	viewCloseButton.type = 'button';
	viewCloseButton.textContent = 'x';

	var viewImage = document.createElement('img');
	viewImage.id = 'gtfo-image-view-image';
	viewImage.alt = '';

	viewDialog.appendChild(viewCloseButton);
	viewDialog.appendChild(viewImage);
	viewOverlay.appendChild(viewDialog);

	stage.appendChild(previousButton);
	stage.appendChild(grid);
	stage.appendChild(nextButton);
	layout.appendChild(toolbar);
	layout.appendChild(stage);
	layout.appendChild(pages);
	layout.appendChild(contextMenu);
	layout.appendChild(infoOverlay);
	layout.appendChild(viewOverlay);

	return layout;
}

function gtfoBuildPage(data) {
	var page = document.getElementById('Page');
	var iframe = document.createElement('iframe');
	var pageHtml = data.pageHtml || (data.html && data.html.source) || '';
	iframe.setAttribute('sandbox', '');
	iframe.srcdoc = pageHtml || `<a href="${gtfoEscapeHtml(gtfoGetPageUrl(data))}">${gtfoEscapeHtml(gtfoGetPageUrl(data))}</a>`;
	page.appendChild(iframe);
}

function gtfoBuildUrls(data) {
	var urls = gtfoGetUrls(data);
	var urlContainer = document.getElementById('Urls');
	urlContainer.appendChild(gtfoCreateUrlToolbar());
	var urlFragment = document.createDocumentFragment();

	urls.forEach((url, index) => {
		urlFragment.appendChild(gtfoCreateUrlRow(url, index, urls.length));
	});
	urlContainer.appendChild(urlFragment);

	document.getElementById('gtfo-select-all').addEventListener('change', (event) => {
		document.querySelectorAll('.gtfo-url-input').forEach((input) => input.checked = event.target.checked);
	});
	document.getElementById('gtfo-copy-urls').addEventListener('click', () => navigator.clipboard.writeText(gtfoSelectedUrls().join('\r\n')));
	document.getElementById('gtfo-save-urls').addEventListener('click', () => {
		var host = gtfoGetHost(data).replace(/[^a-z0-9_-]/gi, '_');
		var link = document.createElement('a');
		link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(gtfoSelectedUrls().join('\r\n'));
		link.download = `urls_${host}_${Date.now()}.txt`;
		link.click();
	});
}

function gtfoBuildComments(data) {
	var comments = document.getElementById('Sources');
	var groups = gtfoGetCommentGroups(data);
	var activeGroup = null;
	var prettifySource = false;
	var foldedLinesBySource = new Map();
	var selectedSourceLinesBySource = new Map();
	var sourceTextBySource = new Map();
	var sourceLinesBySource = new Map();
	var highlightedLinesBySource = new Map();
	var foldRangesBySource = new Map();
	var activeSourceLineRows = [];
	var isSelectingSourceLines = false;
	var toggledSourceLinesDuringDrag = new Set();
	var updateActiveSourceMarkers = null;
	var sourceMarkerResizeFrame = null;
	var sourceResizeObserver = null;
	var pendingSearchScrollLineIndex = null;
	var pendingSearchResultKey = null;
	var sourceNodeByGroup = new WeakMap();

	gtfoClearElement(comments);
	comments.appendChild(gtfoCreateCommentLayout());
	gtfoBindSourceLayoutResizers();

	var nav = document.getElementById('gtfo-comments-nav');
	document.getElementById('gtfo-prettify-source').addEventListener('click', async (event) => {
		prettifySource = !prettifySource;
		document.getElementById('gtfo-prettify-source').classList.toggle('gtfo-prettify-active', prettifySource);
		if (activeGroup && searchInput.value.trim()) {
			var activeSelectedResult = currentSearchResults.find((result) => result.group == activeGroup && selectedSearchResultKeys.has(result.key));
			pendingSearchResultKey = activeSelectedResult ? activeSelectedResult.key : null;
			gtfoRunSourceSearch(true);
		}
		if (activeGroup)
			await renderSource(activeGroup, gtfoGetSelectedCommentsForGroup(activeGroup), false);
	});
	document.addEventListener('mouseup', () => {
		isSelectingSourceLines = false;
		toggledSourceLinesDuringDrag.clear();
	});
	document.addEventListener('selectionchange', () => {
		if (updateActiveSourceMarkers)
			scheduleSourceMarkerUpdate();
	});

	function scheduleSourceMarkerUpdate() {
		if (!updateActiveSourceMarkers || sourceMarkerResizeFrame)
			return;

		sourceMarkerResizeFrame = requestAnimationFrame(() => {
			sourceMarkerResizeFrame = null;
			if (updateActiveSourceMarkers)
				updateActiveSourceMarkers();
		});
	}

	window.addEventListener('resize', scheduleSourceMarkerUpdate);
	if (typeof ResizeObserver == 'function') {
		sourceResizeObserver = new ResizeObserver(scheduleSourceMarkerUpdate);
		sourceResizeObserver.observe(document.getElementById('gtfo-source-panel'));
	}

	function gtfoGetCyanSelectionText() {
		var sourceCode = document.getElementById('gtfo-source-code');
		var selection = window.getSelection();
		if (!sourceCode || !selection || selection.rangeCount == 0 || selection.isCollapsed)
			return '';

		for (let index = 0; index < selection.rangeCount; index++) {
			var range = selection.getRangeAt(index);
			if (range.intersectsNode(sourceCode))
				return selection.toString();
		}

		return '';
	}

	function gtfoGetCyanSelectionLineIndexes() {
		var sourceCode = document.getElementById('gtfo-source-code');
		var selection = window.getSelection();
		var lineIndexes = new Set();
		if (!sourceCode || !selection || selection.rangeCount == 0 || selection.isCollapsed)
			return lineIndexes;

		function getRowFromNode(node) {
			var element = node && (node.nodeType == Node.ELEMENT_NODE ? node : node.parentElement);
			return element ? element.closest('.gtfo-source-line') : null;
		}

		for (let index = 0; index < selection.rangeCount; index++) {
			var range = selection.getRangeAt(index);
			if (!range.intersectsNode(sourceCode))
				continue;

			var startRow = getRowFromNode(range.startContainer);
			var endRow = getRowFromNode(range.endContainer);
			var startIndex = startRow ? Number(startRow.dataset.lineIndex) : 0;
			var endIndex = endRow ? Number(endRow.dataset.lineIndex) : activeSourceLineRows.length - 1;

			if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex))
				continue;

			if (startIndex > endIndex) {
				var swapIndex = startIndex;
				startIndex = endIndex;
				endIndex = swapIndex;
			}

			for (let lineIndex = startIndex; lineIndex <= endIndex; lineIndex++) {
				if (!activeSourceLineRows[lineIndex] || activeSourceLineRows[lineIndex].classList.contains('gtfo-source-hidden'))
					continue;

				lineIndexes.add(lineIndex);
			}
		}

		return lineIndexes;
	}

	function gtfoNormalizeSelectionText(value) {
		return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	}

	function gtfoAppendUniqueSelectionText(sourceText, cyanText) {
		if (!cyanText)
			return sourceText;
		if (!sourceText)
			return cyanText;

		var normalizedSource = gtfoNormalizeSelectionText(sourceText);
		var normalizedCyan = gtfoNormalizeSelectionText(cyanText);
		if (normalizedSource.includes(normalizedCyan))
			return sourceText;

		var uniqueCyanLines = normalizedCyan.split('\n').filter((line) => {
			return line == '' || !normalizedSource.includes(line);
		}).join('\r\n');

		return uniqueCyanLines ? `${sourceText}\r\n${uniqueCyanLines}` : sourceText;
	}

	function gtfoGetSourceSelectionText(mode) {
		var cyanSelection = gtfoGetCyanSelectionText();
		if (mode == 'cyan')
			return cyanSelection;
		if (mode == 'orange')
			return gtfoGetOrangeSelectionText();

		var rows = Array.from(document.querySelectorAll('#gtfo-source-code .gtfo-source-line'));
		var selectedRows = rows.filter((row) => {
			var isRed = row.classList.contains('gtfo-source-highlight');
			var isGreen = row.classList.contains('gtfo-source-line-selected');

			if (mode == 'red')
				return isRed;
			if (mode == 'green')
				return isGreen;
			return isRed || isGreen;
		});

		var sourceLines = selectedRows.map((row) => {
			var lineCode = row.querySelector('.gtfo-line-code');
			return lineCode ? lineCode.textContent : '';
		}).join('\r\n');

		if (mode == 'all') {
			sourceLines = gtfoAppendUniqueSelectionText(sourceLines, gtfoGetOrangeSelectionText());
			if (cyanSelection)
				sourceLines = gtfoAppendUniqueSelectionText(sourceLines, cyanSelection);
		}

		return sourceLines;
	}

	function gtfoGetSelectionTimestamp() {
		var date = new Date();
		function pad(value) {
			return String(value).padStart(2, '0');
		}

		return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	}

	function gtfoDownloadTextFile(filename, content) {
		var link = document.createElement('a');
		link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
		link.download = filename;
		link.click();
	}

	function gtfoGetSelectionExportMode() {
		return document.getElementById('gtfo-selection-export-mode').dataset.value || 'all';
	}

	var selectionDropdown = document.getElementById('gtfo-selection-export-mode');
	var selectionDropdownToggle = document.getElementById('gtfo-selection-export-toggle');
	selectionDropdownToggle.addEventListener('click', (event) => {
		event.stopPropagation();
		selectionDropdown.classList.toggle('gtfo-selection-dropdown-open');
	});
	selectionDropdown.querySelectorAll('.gtfo-selection-menu button').forEach((option) => {
		option.addEventListener('click', (event) => {
			event.stopPropagation();
			selectionDropdown.dataset.value = option.value;
			selectionDropdownToggle.textContent = option.textContent;
			selectionDropdown.classList.remove('gtfo-selection-dropdown-open');
		});
	});
	document.addEventListener('click', () => selectionDropdown.classList.remove('gtfo-selection-dropdown-open'));
	document.addEventListener('click', () => {
		var searchScope = document.getElementById('gtfo-source-search-scope');
		if (searchScope)
			searchScope.classList.remove('gtfo-selection-dropdown-open');
	});

	document.getElementById('gtfo-copy-source-selections').addEventListener('click', () => {
		var mode = gtfoGetSelectionExportMode();
		navigator.clipboard.writeText(gtfoGetSourceSelectionText(mode));
	});
	document.getElementById('gtfo-save-source-selections').addEventListener('click', () => {
		var mode = gtfoGetSelectionExportMode();
		gtfoDownloadTextFile(`page_selections_${gtfoGetSelectionTimestamp()}.txt`, gtfoGetSourceSelectionText(mode));
	});

	var searchScopeInput = document.getElementById('gtfo-source-search-scope');
	var searchScopeToggle = document.getElementById('gtfo-source-search-scope-toggle');
	var searchInput = document.getElementById('gtfo-source-search-input');
	var searchRegexInput = document.getElementById('gtfo-source-search-regex');
	var searchRegexToggle = document.getElementById('gtfo-source-search-regex-toggle');
	var searchCaseInput = document.getElementById('gtfo-source-search-case');
	var searchCaseToggle = document.getElementById('gtfo-source-search-case-toggle');
	var searchSelectAllInput = document.getElementById('gtfo-source-search-select-all');
	var searchSelectAllToggle = document.getElementById('gtfo-source-search-select-all-toggle');
	var searchSummary = document.getElementById('gtfo-source-search-summary');
	var searchResults = document.getElementById('gtfo-source-search-results');
	var searchTimer = null;
	var currentSearchResults = [];
	var selectedSearchResultKeys = new Set();
	var selectedSearchRangesByGroup = new WeakMap();
	var collapsedSearchGroupKeys = new Set();

	function gtfoScheduleSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(gtfoRunSourceSearch, 120);
	}

	function gtfoUpdateSearchRegexToggle() {
		searchRegexToggle.classList.toggle('gtfo-search-toggle-active', searchRegexInput.checked);
	}

	function gtfoUpdateSearchCaseToggle() {
		searchCaseToggle.classList.toggle('gtfo-search-toggle-active', searchCaseInput.checked);
	}

	function gtfoUpdateSearchSelectAllToggle() {
		searchSelectAllToggle.classList.toggle('gtfo-search-toggle-active', searchSelectAllInput.checked);
	}

	searchScopeToggle.addEventListener('click', (event) => {
		event.stopPropagation();
		searchScopeInput.classList.toggle('gtfo-selection-dropdown-open');
	});
	searchScopeInput.querySelectorAll('.gtfo-selection-menu button').forEach((option) => {
		option.addEventListener('click', (event) => {
			event.stopPropagation();
			searchScopeInput.dataset.value = option.value;
			searchScopeToggle.textContent = option.textContent;
			searchScopeInput.classList.remove('gtfo-selection-dropdown-open');
			gtfoRunSourceSearch();
		});
	});
	searchInput.addEventListener('input', gtfoScheduleSearch);
	searchRegexToggle.addEventListener('click', (event) => {
		event.preventDefault();
		searchRegexInput.checked = !searchRegexInput.checked;
		gtfoUpdateSearchRegexToggle();
		gtfoRunSourceSearch();
	});
	gtfoUpdateSearchRegexToggle();
	searchCaseToggle.addEventListener('click', (event) => {
		event.preventDefault();
		searchCaseInput.checked = !searchCaseInput.checked;
		gtfoUpdateSearchCaseToggle();
		gtfoRunSourceSearch();
	});
	gtfoUpdateSearchCaseToggle();
	searchSelectAllToggle.addEventListener('click', (event) => {
		event.preventDefault();
		searchSelectAllInput.checked = !searchSelectAllInput.checked;
		gtfoUpdateSearchSelectAllToggle();
		if (searchSelectAllInput.checked) {
			for (let result of currentSearchResults)
				selectedSearchResultKeys.add(result.key);
		}
		else {
			selectedSearchResultKeys.clear();
		}
		gtfoRefreshSearchSelections();
	});
	gtfoUpdateSearchSelectAllToggle();

	function gtfoGetSelectedCommentsForGroup(group) {
		return Array.from(document.querySelectorAll('.gtfo-comment-active'))
			.filter((item) => item.gtfoGroup == group)
			.map((item) => item.gtfoComment);
	}

	function gtfoClearSelections() {
		document.querySelectorAll('.gtfo-comment-list li').forEach((item) => item.classList.remove('gtfo-comment-active'));
	}

	function gtfoGetFoldStateKey(group) {
		return `${group.title}::${group.url || group.displayName || ''}::${prettifySource ? 'pretty' : 'raw'}`;
	}

	function gtfoGetSourceStateKey(group) {
		return gtfoGetFoldStateKey(group);
	}

	async function renderSource(group, selectedComments, keepScroll, scrollComment) {
		var sourceTitle = document.getElementById('gtfo-source-title-text');
		var sourceCode = document.getElementById('gtfo-source-code');
		var sourcePanel = document.getElementById('gtfo-source-panel');
		var sourceMarkers = document.getElementById('gtfo-source-markers');
		var sourceType = gtfoGetSourceType(group);
		var foldStateKey = gtfoGetFoldStateKey(group);
		var sourceStateKey = gtfoGetSourceStateKey(group);
		var rawSource = group.source || 'Source was not available for this subject.';
		selectedComments = selectedComments || [];
		var foldedLines = foldedLinesBySource.get(foldStateKey) || new Set();
		var selectedSourceLines = selectedSourceLinesBySource.get(sourceStateKey) || new Set();
		var previousScrollTop = sourcePanel.scrollTop;
		var previousScrollLeft = sourcePanel.scrollLeft;

		sourceTitle.textContent = `${group.title} [processing]`;
		gtfoClearElement(sourceCode);
		sourceCode.textContent = 'Analyzing source in worker...';

		var analysis = await gtfoAnalyzeSourceInWorker(rawSource, sourceType, prettifySource, selectedComments, scrollComment);
		if (activeGroup != group)
			return;

		sourceTextBySource.set(sourceStateKey, analysis.source);
		sourceLinesBySource.set(sourceStateKey, analysis.lines);
		highlightedLinesBySource.set(sourceStateKey, analysis.highlightedLines);
		foldRangesBySource.set(sourceStateKey, new Map(analysis.foldRanges || []));

		var source = sourceTextBySource.get(sourceStateKey);
		var lines = sourceLinesBySource.get(sourceStateKey);
		var highlightedLines = highlightedLinesBySource.get(sourceStateKey);
		var selectedLineIndexes = new Set(analysis.selectedLineIndexes || []);
		var scrollRange = analysis.scrollRange || null;
		var foldRanges = foldRangesBySource.get(sourceStateKey);
		var lineNumberWidth = String(lines.length).length;

		if (scrollRange) {
			for (let [foldStart, foldEnd] of foldRanges) {
				if (foldStart < scrollRange.start && foldEnd >= scrollRange.start)
					foldedLines.delete(foldStart);
			}
		}

		sourceTitle.textContent = group.title;
		gtfoClearElement(sourceCode);
		gtfoClearElement(sourceMarkers);
		var lineRows = [];
		activeSourceLineRows = lineRows;
		var hiddenLineCounts = new Uint32Array(lines.length);

		function updateSourceMarkers() {
			gtfoClearElement(sourceMarkers);
			var panelRect = sourcePanel.getBoundingClientRect();
			var scrollbarWidth = sourcePanel.offsetWidth - sourcePanel.clientWidth;
			var hasVerticalScrollbar = sourcePanel.scrollHeight > sourcePanel.clientHeight;
			var markerWidth = scrollbarWidth;
			var scrollbarButtonSize = scrollbarWidth;
			var markerTop = panelRect.top + scrollbarButtonSize;
			var markerHeight = sourcePanel.clientHeight - (scrollbarButtonSize * 2);
			var markerLeft = panelRect.right - scrollbarWidth;

			sourceMarkers.style.display = hasVerticalScrollbar && markerWidth > 0 && markerHeight > 0 ? 'block' : 'none';
			sourceMarkers.style.left = `${markerLeft}px`;
			sourceMarkers.style.top = `${markerTop}px`;
			sourceMarkers.style.height = `${markerHeight}px`;
			sourceMarkers.style.width = `${markerWidth}px`;
			var markerFragment = document.createDocumentFragment();

			function appendMarker(lineIndex, className) {
				if (lines.length <= 1)
					return;

				var marker = document.createElement('div');
				marker.className = className;
				var markerTop = Math.max(0, Math.min(markerHeight - 3, (lineIndex / (lines.length - 1)) * markerHeight));
				marker.style.top = `${markerTop}px`;
				markerFragment.appendChild(marker);
			}

			for (let lineIndex of selectedLineIndexes)
				appendMarker(lineIndex, 'gtfo-source-marker');

			for (let lineIndex of selectedSourceLines)
				appendMarker(lineIndex, 'gtfo-source-marker gtfo-source-marker-line');

			for (let lineIndex of gtfoGetSelectedSearchLineIndexes(group))
				appendMarker(lineIndex, 'gtfo-source-marker gtfo-source-marker-orange');

			for (let lineIndex of gtfoGetCyanSelectionLineIndexes())
				appendMarker(lineIndex, 'gtfo-source-marker gtfo-source-marker-cyan');

			sourceMarkers.appendChild(markerFragment);
		}
		updateActiveSourceMarkers = updateSourceMarkers;

		function updateSourceLineSelectionClass(lineIndex) {
			var row = lineRows[lineIndex];
			if (row)
				row.classList.toggle('gtfo-source-line-selected', selectedSourceLines.has(lineIndex));
		}

		function setSourceLineSelection(lineIndex, additive) {
			var changedLineIndexes = new Set();

			if (additive) {
				if (selectedSourceLines.has(lineIndex)) {
					selectedSourceLines.delete(lineIndex);
					changedLineIndexes.add(lineIndex);
				}
				else {
					selectedSourceLines.add(lineIndex);
					changedLineIndexes.add(lineIndex);
				}
			}
			else if (selectedSourceLines.has(lineIndex)) {
				for (let selectedLineIndex of selectedSourceLines)
					changedLineIndexes.add(selectedLineIndex);
				selectedSourceLines.clear();
			}
			else {
				for (let selectedLineIndex of selectedSourceLines)
					changedLineIndexes.add(selectedLineIndex);
				selectedSourceLines.clear();
				selectedSourceLines.add(lineIndex);
				changedLineIndexes.add(lineIndex);
			}

			selectedSourceLinesBySource.set(sourceStateKey, selectedSourceLines);
			for (let changedLineIndex of changedLineIndexes)
				updateSourceLineSelectionClass(changedLineIndex);
			scheduleSourceMarkerUpdate();
		}

		function updateFoldRow(lineIndex) {
			var row = lineRows[lineIndex];
			if (!row)
				return;

			row.classList.toggle('gtfo-source-hidden', hiddenLineCounts[lineIndex] > 0);
			row.classList.toggle('gtfo-source-folded', foldedLines.has(lineIndex));
			row.classList.toggle('gtfo-source-line-selected', selectedSourceLines.has(lineIndex));

			var toggle = row.querySelector('.gtfo-fold-toggle');
			if (toggle)
				toggle.textContent = foldedLines.has(lineIndex) ? '>' : 'v';
		}

		function rebuildFoldVisibility() {
			hiddenLineCounts.fill(0);

			for (let [foldStart, foldEnd] of foldRanges) {
				if (!foldedLines.has(foldStart))
					continue;

				for (let lineIndex = foldStart + 1; lineIndex <= foldEnd; lineIndex++)
					hiddenLineCounts[lineIndex]++;
			}

			lineRows.forEach((row, lineIndex) => updateFoldRow(lineIndex));
		}

		function updateFoldVisibility(foldStart, isFolded) {
			var foldEnd = foldRanges.get(foldStart);
			if (!Number.isFinite(foldEnd))
				return;

			var delta = isFolded ? 1 : -1;
			for (let lineIndex = foldStart + 1; lineIndex <= foldEnd; lineIndex++) {
				hiddenLineCounts[lineIndex] = Math.max(0, hiddenLineCounts[lineIndex] + delta);
				updateFoldRow(lineIndex);
			}

			updateFoldRow(foldStart);
			scheduleSourceMarkerUpdate();
		}

		var lineFragment = document.createDocumentFragment();
		lines.forEach((line, index) => {
			var lineElement = document.createElement('div');
			var lineMatches = selectedLineIndexes.has(index);
			var scrollMatch = scrollRange && index == scrollRange.start;
			lineElement.className = lineMatches ? 'gtfo-source-line gtfo-source-highlight' : 'gtfo-source-line';
			lineElement.dataset.lineIndex = String(index);
			if (scrollMatch)
				lineElement.classList.add('gtfo-source-scroll-target');
			if (selectedSourceLines.has(index))
				lineElement.classList.add('gtfo-source-line-selected');

			var lineNumber = document.createElement('span');
			lineNumber.className = 'gtfo-line-number';
			lineNumber.addEventListener('mousedown', (event) => {
				if (event.button != 0)
					return;

				isSelectingSourceLines = true;
				toggledSourceLinesDuringDrag = new Set([index]);
				setSourceLineSelection(index, event.altKey || event.getModifierState('Alt'));
				event.preventDefault();
			});
			lineNumber.addEventListener('mouseenter', (event) => {
				if (isSelectingSourceLines && event.buttons == 1 && (event.altKey || event.getModifierState('Alt')) && !toggledSourceLinesDuringDrag.has(index)) {
					toggledSourceLinesDuringDrag.add(index);
					setSourceLineSelection(index, true);
				}
			});

			if (foldRanges.has(index)) {
				var foldToggle = document.createElement('button');
				foldToggle.className = 'gtfo-fold-toggle';
				foldToggle.type = 'button';
				foldToggle.title = 'Toggle fold';
				foldToggle.textContent = foldedLines.has(index) ? '>' : 'v';
				foldToggle.addEventListener('mousedown', (event) => {
					event.preventDefault();
					event.stopPropagation();
				});
				foldToggle.addEventListener('click', (event) => {
					event.preventDefault();
					event.stopPropagation();

					var isFolded;
					if (foldedLines.has(index)) {
						foldedLines.delete(index);
						isFolded = false;
					}
					else {
						foldedLines.add(index);
						isFolded = true;
					}

					foldedLinesBySource.set(foldStateKey, foldedLines);
					updateFoldVisibility(index, isFolded);
				});
				lineNumber.appendChild(foldToggle);
			}
			else {
				var foldPlaceholder = document.createElement('span');
				foldPlaceholder.className = 'gtfo-fold-placeholder';
				lineNumber.appendChild(foldPlaceholder);
			}

			var lineNumberText = document.createElement('span');
			lineNumberText.textContent = String(index + 1).padStart(lineNumberWidth, ' ');
			lineNumber.appendChild(lineNumberText);

			var lineCode = document.createElement('span');
			lineCode.className = 'gtfo-line-code';
			gtfoSetHighlightedSyntax(lineCode, highlightedLines[index]);
			gtfoApplySearchHighlights(lineCode, group, index);

			lineElement.appendChild(lineNumber);
			lineElement.appendChild(lineCode);
			lineRows[index] = lineElement;
			lineFragment.appendChild(lineElement);
		});
		sourceCode.appendChild(lineFragment);

		rebuildFoldVisibility();
		foldedLinesBySource.set(foldStateKey, foldedLines);
		selectedSourceLinesBySource.set(sourceStateKey, selectedSourceLines);

		if (scrollRange) {
			var firstHighlight = sourceCode.querySelector('.gtfo-source-scroll-target') || sourceCode.querySelector('.gtfo-source-highlight');
			if (firstHighlight)
				gtfoScrollIntoViewIfNeeded(sourcePanel, firstHighlight);
		}
		else if (Number.isFinite(pendingSearchScrollLineIndex)) {
			var targetRow = lineRows[pendingSearchScrollLineIndex];
			pendingSearchScrollLineIndex = null;
			if (targetRow)
				gtfoScrollIntoViewIfNeeded(sourcePanel, targetRow);
		}
		else if (keepScroll) {
			sourcePanel.scrollTop = previousScrollTop;
			sourcePanel.scrollLeft = previousScrollLeft;
		}
		else {
			sourcePanel.scrollTop = 0;
			sourcePanel.scrollLeft = 0;
		}

		updateSourceMarkers();
	}

	async function setActiveGroup(node, group) {
		document.querySelectorAll('.gtfo-tree-node-active').forEach((item) => item.classList.remove('gtfo-tree-node-active'));
		node.classList.add('gtfo-tree-node-active');
		activeGroup = group;
		if (searchInput.value.trim())
			gtfoRunSourceSearch(true);
		await renderSource(group, gtfoGetSelectedCommentsForGroup(group));
	}

	function gtfoJumpToSearchResult(group, lineIndex, resultKey) {
		var sourceNode = sourceNodeByGroup.get(group);
		if (!sourceNode)
			return;

		pendingSearchScrollLineIndex = resultKey ? null : lineIndex;
		pendingSearchResultKey = resultKey || null;
		setActiveGroup(sourceNode, group);
	}

	function setActiveComment(event, item, sourceNode, group, comment) {
		var multiSelect = item.dataset.gtfoMultiSelect == 'true' || event.altKey || event.getModifierState('Alt');
		item.dataset.gtfoMultiSelect = 'false';

		if (multiSelect) {
			event.preventDefault();
			event.stopPropagation();
		}

		document.querySelectorAll('.gtfo-tree-node-active').forEach((item) => item.classList.remove('gtfo-tree-node-active'));

		sourceNode.classList.add('gtfo-tree-node-active');
		activeGroup = group;

		var wasActive = item.classList.contains('gtfo-comment-active');
		if (multiSelect) {
			item.classList.toggle('gtfo-comment-active');
		}
		else if (wasActive) {
			gtfoClearSelections();
		}
		else {
			gtfoClearSelections();
			item.classList.add('gtfo-comment-active');
		}

		if (multiSelect)
			renderSource(group, gtfoGetSelectedCommentsForGroup(group), true, null);
		else if (wasActive)
			renderSource(group, [], true, null);
		else
			renderSource(group, gtfoGetSelectedCommentsForGroup(group), false, comment);
	}

	function countGroupComments(groupList) {
		return groupList.reduce((total, group) => total + group.comments.length, 0);
	}

	function gtfoGetSearchGroups() {
		var scope = searchScopeInput.dataset.value || 'current';
		if (scope == 'current')
			return activeGroup ? [activeGroup] : [];

		return groups.filter((group) => {
			if (scope == 'all')
				return true;
			return gtfoGetSourceType(group) == scope;
		});
	}

	function gtfoParseSearchPattern(query, regexMode, caseSensitive) {
		if (!query)
			return null;

		if (regexMode) {
			var pattern = query;
			var flags = caseSensitive ? 'g' : 'gi';
			var slashMatch = query.match(/^\/([\s\S]*)\/([a-z]*)$/i);
			if (slashMatch) {
				pattern = slashMatch[1];
				flags = slashMatch[2] || flags;
			}
			if (!flags.includes('g'))
				flags += 'g';
			if (!caseSensitive && !flags.includes('i'))
				flags += 'i';
			if (caseSensitive)
				flags = flags.replace(/i/g, '');

			return new RegExp(pattern, flags);
		}

		return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
	}

	function gtfoGetGroupSourceLines(group) {
		var sourceStateKey = gtfoGetSourceStateKey(group);
		var source = sourceTextBySource.get(sourceStateKey);
		if (typeof source != 'string' && prettifySource) {
			var rawSource = group.source || '';
			source = gtfoFormatSource(rawSource, gtfoGetSourceType(group));
			sourceTextBySource.set(sourceStateKey, source);
		}
		if (typeof source != 'string')
			source = group.source || '';
		return String(source || '').split(/\r?\n/);
	}

	function gtfoGetLineMatches(line, matcher, regexMode) {
		line = String(line || '');
		matcher.lastIndex = 0;
		var matches = Array.from(line.matchAll(matcher));
		if (matches.length > 0 || !regexMode)
			return matches;

		var trimmedLine = line.trim();
		if (trimmedLine == line)
			return matches;

		var trimOffset = line.indexOf(trimmedLine);
		matcher.lastIndex = 0;
		return Array.from(trimmedLine.matchAll(matcher)).map((match) => {
			match.index = (match.index || 0) + trimOffset;
			return match;
		});
	}

	function gtfoBuildSearchResultKey(group, text, occurrenceIndex) {
		return `${gtfoBuildSearchGroupKey(group)}::${text}::${occurrenceIndex}`;
	}

	function gtfoBuildSearchGroupKey(group) {
		return `${group.title}::${group.url || group.displayName || ''}`;
	}

	function gtfoGetSelectedSearchResults() {
		return currentSearchResults.filter((result) => selectedSearchResultKeys.has(result.key));
	}

	function gtfoGetOrangeSelectionText() {
		return gtfoGetSelectedSearchResults()
			.map((result) => result.text)
			.filter((text) => text)
			.join('\r\n');
	}

	function gtfoRebuildSelectedSearchRanges() {
		selectedSearchRangesByGroup = new WeakMap();

		for (let result of gtfoGetSelectedSearchResults()) {
			var rangesByLine = selectedSearchRangesByGroup.get(result.group);
			if (!rangesByLine) {
				rangesByLine = new Map();
				selectedSearchRangesByGroup.set(result.group, rangesByLine);
			}

			var lineRanges = rangesByLine.get(result.lineIndex) || [];
			lineRanges.push({
				start: result.start,
				end: result.end
			});
			rangesByLine.set(result.lineIndex, lineRanges);
		}
	}

	function gtfoGetSelectedSearchLineIndexes(group) {
		var rangesByLine = selectedSearchRangesByGroup.get(group);
		return rangesByLine ? Array.from(rangesByLine.keys()) : [];
	}

	function gtfoApplySearchHighlights(lineCode, group, lineIndex) {
		var rangesByLine = selectedSearchRangesByGroup.get(group);
		var ranges = rangesByLine && rangesByLine.get(lineIndex);
		if (!ranges || ranges.length == 0)
			return;

		ranges = ranges.slice().sort((a, b) => a.start - b.start);
		var currentOffset = 0;
		var walker = document.createTreeWalker(lineCode, NodeFilter.SHOW_TEXT, null, null);
		var textNodes = [];
		var node;
		while (node = walker.nextNode()) {
			textNodes.push({
				node: node,
				start: currentOffset,
				end: currentOffset + node.nodeValue.length
			});
			currentOffset += node.nodeValue.length;
		}

		for (let index = textNodes.length - 1; index >= 0; index--) {
			var item = textNodes[index];
			var nodeRanges = ranges
				.map((range) => ({
					start: Math.max(range.start, item.start) - item.start,
					end: Math.min(range.end, item.end) - item.start
				}))
				.filter((range) => range.end > range.start)
				.sort((a, b) => b.start - a.start);

			for (let range of nodeRanges) {
				var matchRange = document.createRange();
				matchRange.setStart(item.node, range.start);
				matchRange.setEnd(item.node, range.end);
				var span = document.createElement('span');
				span.className = 'gtfo-source-search-selected';
				matchRange.surroundContents(span);
			}
		}
	}

	function gtfoRefreshSearchSelections(skipSourceRender) {
		gtfoRebuildSelectedSearchRanges();
		searchSelectAllInput.checked = currentSearchResults.length > 0 && currentSearchResults.every((result) => selectedSearchResultKeys.has(result.key));
		gtfoUpdateSearchSelectAllToggle();

		searchResults.querySelectorAll('.gtfo-search-file-title').forEach((button) => {
			button.classList.toggle('gtfo-search-file-title-selected', button.gtfoGroup == activeGroup);
		});

		searchResults.querySelectorAll('.gtfo-search-result').forEach((button) => {
			var keys = String(button.dataset.searchKeys || '').split('\n').filter((key) => key);
			button.classList.toggle('gtfo-search-result-selected', keys.length > 0 && keys.every((key) => selectedSearchResultKeys.has(key)));
		});

		if (skipSourceRender)
			return;

		if (updateActiveSourceMarkers)
			scheduleSourceMarkerUpdate();
	}

	function gtfoToggleSearchResultSet(results, additive, skipSourceRender) {
		results = results || [];
		if (results.length == 0)
			return;

		if (additive) {
			var allSelected = results.every((result) => selectedSearchResultKeys.has(result.key));
			for (let result of results) {
				if (allSelected)
					selectedSearchResultKeys.delete(result.key);
				else
					selectedSearchResultKeys.add(result.key);
			}
		}
		else if (results.every((result) => selectedSearchResultKeys.has(result.key)) && selectedSearchResultKeys.size == results.length) {
			selectedSearchResultKeys.clear();
		}
		else {
			selectedSearchResultKeys.clear();
			for (let result of results)
				selectedSearchResultKeys.add(result.key);
		}

		gtfoRefreshSearchSelections(skipSourceRender);
	}

	function gtfoOpenSearchResultGroup(group, results) {
		if (results && results.length > 0)
			gtfoJumpToSearchResult(group, results[0].lineIndex, results[0].key);
		else {
			var sourceNode = sourceNodeByGroup.get(group);
			if (sourceNode)
				setActiveGroup(sourceNode, group);
		}
	}

	function gtfoRunSourceSearch(preserveSelections) {
		var query = searchInput.value.trim();
		var previousSelectedKeys = preserveSelections ? new Set(selectedSearchResultKeys) : null;
		var previousResultsScrollTop = searchResults.scrollTop;
		gtfoClearElement(searchResults);
		currentSearchResults = [];
		if (!preserveSelections)
			selectedSearchResultKeys.clear();
		selectedSearchRangesByGroup = new WeakMap();

		if (!query) {
			searchSummary.textContent = 'Enter a search query.';
			gtfoRefreshSearchSelections();
			return;
		}

		var matcher;
		var regexMode = searchRegexInput.checked || /^\/[\s\S]*\/[a-z]*$/i.test(query);
		var caseSensitive = searchCaseInput.checked;
		try {
			matcher = gtfoParseSearchPattern(query, regexMode, caseSensitive);
		}
		catch (error) {
			searchSummary.textContent = `Invalid regex: ${error.message || error}`;
			return;
		}
		if (!matcher)
			return;

		var searchGroups = gtfoGetSearchGroups();
		var totalMatches = 0;
		var matchedFiles = 0;
		var resultFragment = document.createDocumentFragment();

		for (let group of searchGroups) {
			var lines = gtfoGetGroupSourceLines(group);
			var groupMatches = [];
			var matchOccurrenceByText = new Map();

			for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
				var line = String(lines[lineIndex] || '');
				var matches = gtfoGetLineMatches(line, matcher, regexMode);
				if (matches.length == 0)
					continue;

				totalMatches += matches.length;
				var resultMatches = matches.map((match, matchIndex) => {
					var text = match[0] || '';
					var start = Number.isFinite(match.index) ? match.index : line.indexOf(text);
					var end = start + text.length;
					var occurrenceIndex = matchOccurrenceByText.get(text) || 0;
					matchOccurrenceByText.set(text, occurrenceIndex + 1);
					return {
						key: gtfoBuildSearchResultKey(group, text, occurrenceIndex),
						group: group,
						lineIndex: lineIndex,
						start: start,
						end: end,
						text: text
					};
				}).filter((match) => match.text && match.start >= 0);
				currentSearchResults.push.apply(currentSearchResults, resultMatches);
				groupMatches.push({
					lineIndex: lineIndex,
					count: matches.length,
					preview: line.trim() || ' ',
					matches: resultMatches
				});
			}

			if (groupMatches.length == 0)
				continue;

			matchedFiles++;
			let fileNode = document.createElement('div');
			fileNode.className = 'gtfo-search-file';
			let groupKey = gtfoBuildSearchGroupKey(group);
			let isCollapsed = collapsedSearchGroupKeys.has(groupKey);
			fileNode.classList.toggle('gtfo-search-file-collapsed', isCollapsed);
			let fileHeader = document.createElement('div');
			fileHeader.className = 'gtfo-search-file-header';
			let fileTitle = document.createElement('button');
			fileTitle.type = 'button';
			fileTitle.className = 'gtfo-search-file-title';
			fileTitle.gtfoGroup = group;
			fileTitle.textContent = `${group.displayName || group.title} [${gtfoPlural(groupMatches.reduce((total, item) => total + item.count, 0), 'match', 'matches')}]`;
			let groupResultMatches = groupMatches.flatMap((item) => item.matches);
			fileTitle.addEventListener('click', () => gtfoOpenSearchResultGroup(group, groupResultMatches));
			fileHeader.appendChild(fileTitle);

			let collapseButton = document.createElement('button');
			collapseButton.type = 'button';
			collapseButton.className = 'gtfo-search-file-collapse';
			collapseButton.textContent = isCollapsed ? '[+]' : '[-]';
			collapseButton.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
			collapseButton.title = isCollapsed ? 'Expand results' : 'Collapse results';
			collapseButton.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				let nextCollapsed = !fileNode.classList.contains('gtfo-search-file-collapsed');
				fileNode.classList.toggle('gtfo-search-file-collapsed', nextCollapsed);
				collapseButton.textContent = nextCollapsed ? '[+]' : '[-]';
				collapseButton.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
				collapseButton.title = nextCollapsed ? 'Expand results' : 'Collapse results';
				if (nextCollapsed)
					collapsedSearchGroupKeys.add(groupKey);
				else
					collapsedSearchGroupKeys.delete(groupKey);
			});
			fileHeader.appendChild(collapseButton);
			fileNode.appendChild(fileHeader);

			let fileResults = document.createElement('div');
			fileResults.className = 'gtfo-search-file-results';

			for (let result of groupMatches) {
				var button = document.createElement('button');
				button.type = 'button';
				button.className = 'gtfo-search-result';
				button.gtfoGroup = group;
				button.dataset.searchKeys = result.matches.map((match) => match.key).join('\n');
				button.addEventListener('click', (event) => {
					gtfoToggleSearchResultSet(result.matches, event.altKey || event.getModifierState('Alt'), true);
					gtfoJumpToSearchResult(group, result.lineIndex, result.matches[0] && result.matches[0].key);
				});

				var lineNumber = document.createElement('span');
				lineNumber.className = 'gtfo-search-line';
				lineNumber.textContent = `Ln ${result.lineIndex + 1}`;
				var preview = document.createElement('span');
				preview.className = 'gtfo-search-preview';
				preview.textContent = result.preview;

				button.appendChild(lineNumber);
				button.appendChild(preview);
				fileResults.appendChild(button);
			}

			fileNode.appendChild(fileResults);
			resultFragment.appendChild(fileNode);
		}

		searchSummary.textContent = `${gtfoPlural(totalMatches, 'result', 'results')} in ${gtfoPlural(matchedFiles, 'source', 'sources')}`;
		searchResults.appendChild(resultFragment);
		if (preserveSelections && previousSelectedKeys) {
			selectedSearchResultKeys = new Set(currentSearchResults
				.filter((result) => previousSelectedKeys.has(result.key))
				.map((result) => result.key));
		}
		else if (searchSelectAllInput.checked) {
			for (let result of currentSearchResults)
				selectedSearchResultKeys.add(result.key);
		}
		if (pendingSearchResultKey && activeGroup) {
			var recalculatedTarget = currentSearchResults.find((result) => result.group == activeGroup && result.key == pendingSearchResultKey);
			if (recalculatedTarget)
				pendingSearchScrollLineIndex = recalculatedTarget.lineIndex;
			pendingSearchResultKey = null;
		}
		gtfoRefreshSearchSelections();
		searchResults.scrollTop = previousResultsScrollTop;
	}

	function createTreeNode(label, options) {
		options = options || {};
		var node = document.createElement('li');
		node.className = 'gtfo-source-tree-node';
		if (options.collapsed)
			node.classList.add('gtfo-tree-collapsed');
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'gtfo-tree-label';
		button.textContent = label;
		node.appendChild(button);

		if (options.children) {
			button.classList.add('gtfo-tree-toggle');
			node.appendChild(options.children);
			button.addEventListener('click', () => node.classList.toggle('gtfo-tree-collapsed'));
		}
		else if (options.onClick) {
			button.addEventListener('click', options.onClick);
		}

		return node;
	}

	function createCommentNode(comment, sourceNode, group) {
		var item = document.createElement('li');
		item.textContent = comment;
		item.gtfoGroup = group;
		item.gtfoComment = comment;
		item.addEventListener('pointerdown', (event) => {
			var isMultiSelect = event.altKey || event.getModifierState('Alt');
			item.dataset.gtfoMultiSelect = isMultiSelect ? 'true' : 'false';
			if (isMultiSelect)
				event.preventDefault();
		});
		item.addEventListener('mousedown', (event) => {
			var isMultiSelect = event.altKey || event.getModifierState('Alt');
			item.dataset.gtfoMultiSelect = isMultiSelect ? 'true' : item.dataset.gtfoMultiSelect;
			if (isMultiSelect)
				event.preventDefault();
		});
		item.addEventListener('click', (event) => setActiveComment(event, item, sourceNode, group, comment));
		return item;
	}

	function createSourceNode(group, label) {
		var hasComments = group.comments.length > 0;
		var commentList = hasComments ? document.createElement('ul') : null;
		if (commentList)
			commentList.className = 'gtfo-comment-list';

		var sourceNode = createTreeNode(label, hasComments ? {
			children: commentList,
			collapsed: true
		} : {
			onClick: () => setActiveGroup(sourceNode, group)
		});

		sourceNode.classList.add('gtfo-source-file-node');
		sourceNode.gtfoGroup = group;
		sourceNodeByGroup.set(group, sourceNode);
		if (hasComments) {
			sourceNode.querySelector(':scope > .gtfo-tree-label').addEventListener('click', (event) => {
				if (event.target == sourceNode.querySelector(':scope > .gtfo-tree-label'))
					setActiveGroup(sourceNode, group);
			});

			for (let comment of group.comments)
				commentList.appendChild(createCommentNode(comment, sourceNode, group));
		}

		return sourceNode;
	}

	function appendSourceCategory(parentList, label, groupList, singular, plural) {
		if (groupList.length == 0)
			return;

		singular = singular || 'source';
		plural = plural || 'sources';
		var categoryList = document.createElement('ul');
		for (let [index, group] of groupList.entries()) {
			var name = group.displayName || group.title;
			if (group.sourceScope == 'inline' && groupList.length > 1)
				name = `${name} ${index + 1}`;
			categoryList.appendChild(createSourceNode(group, `${name} [${gtfoPlural(group.comments.length, 'comment', 'comments')}]`));
		}

		parentList.appendChild(createTreeNode(`${label} [${gtfoPlural(groupList.length, singular, plural)}, ${gtfoPlural(countGroupComments(groupList), 'comment', 'comments')}]`, {
			children: categoryList
		}));
	}

	function appendLanguageRoot(root, label, groupList, builder, singular, plural) {
		if (groupList.length == 0)
			return;

		singular = singular || 'source';
		plural = plural || 'sources';
		var languageList = document.createElement('ul');
		builder(languageList, groupList);
		root.appendChild(createTreeNode(`${label} [${gtfoPlural(groupList.length, singular, plural)}, ${gtfoPlural(countGroupComments(groupList), 'comment', 'comments')}]`, {
			children: languageList
		}));
	}

	var tree = document.createElement('ul');
	tree.className = 'gtfo-source-tree';
	var htmlGroups = groups.filter((group) => group.sourceType == 'html');
	var jsGroups = groups.filter((group) => group.sourceType == 'javascript');
	var cssGroups = groups.filter((group) => group.sourceType == 'css');

	appendLanguageRoot(tree, 'HTML', htmlGroups, (languageList, groupList) => {
		for (let group of groupList) {
			languageList.appendChild(createSourceNode(group, `${group.displayName || 'Page'} [${gtfoPlural(group.comments.length, 'comment', 'comments')}]`));
		}
	});
	appendLanguageRoot(tree, 'JavaScript', jsGroups, (languageList, groupList) => {
		appendSourceCategory(languageList, 'Page Scripts', groupList.filter((group) => group.sourceScope == 'page'), 'script', 'scripts');
		appendSourceCategory(languageList, 'Inline Scripts', groupList.filter((group) => group.sourceScope == 'inline'), 'script', 'scripts');
		appendSourceCategory(languageList, 'Same-Origin Scripts', groupList.filter((group) => group.sourceScope == 'same-origin'), 'script', 'scripts');
		appendSourceCategory(languageList, 'Third-Party Scripts', groupList.filter((group) => group.sourceScope == 'third-party'), 'script', 'scripts');
	}, 'script', 'scripts');
	appendLanguageRoot(tree, 'CSS', cssGroups, (languageList, groupList) => {
		appendSourceCategory(languageList, 'Same-Origin Stylesheets', groupList.filter((group) => group.sourceScope != 'third-party'), 'stylesheet', 'stylesheets');
		appendSourceCategory(languageList, 'Third-Party Stylesheets', groupList.filter((group) => group.sourceScope == 'third-party'), 'stylesheet', 'stylesheets');
	}, 'stylesheet', 'stylesheets');

	nav.appendChild(tree);

	if (groups.length > 0) {
		var pageSource = Array.from(nav.querySelectorAll('.gtfo-source-file-node')).find((node) => {
			return node.gtfoGroup && node.gtfoGroup.sourceType == 'html' && node.gtfoGroup.sourceScope == 'page';
		});
		var firstSource = pageSource || nav.querySelector('.gtfo-source-file-node');
		if (firstSource)
			setActiveGroup(firstSource, firstSource.gtfoGroup);
	}
}

function gtfoBuildImages(data) {
	var images = document.getElementById('Images');
	var unnamedImageCount = 0;
	var host = gtfoGetHost(data).replace(/[^a-z0-9_-]/gi, '_');
	var imageList = (data.images || []).map((image, index) => {
		var url = gtfoGetImageUrl(image);
		var urlName = gtfoGetImageFileNameFromUrl(url);
		var fallbackName = '';

		if (!urlName) {
			unnamedImageCount++;
			fallbackName = String(unnamedImageCount).padStart(3, '0');
		}

		var name = gtfoGetImageDisplayName(image, fallbackName || String(index + 1).padStart(3, '0'));
		var type = gtfoGetImageType(image);

		return {
			image: image,
			index: index,
			url: url,
			name: gtfoEnsureImageExtension(name, type),
			dimensions: gtfoGetImageDimensions(image)
		};
	});
	var gridSizes = [
		{ label: '1x1', columns: 1, rows: 1 },
		{ label: '3x3', columns: 3, rows: 3 },
		{ label: '5x4', columns: 5, rows: 4 },
		{ label: '8x5', columns: 8, rows: 5 },
		{ label: '12x6', columns: 12, rows: 6 }
	];
	var activeGridSize = gridSizes[2];
	var activePage = 0;
	var showAllImages = false;

	if (imageList.length == 0) {
		gtfoClearElement(images);
		var empty = document.createElement('div');
		empty.className = 'gtfo-images-empty';
		empty.textContent = 'No images found';
		images.appendChild(empty);
		return;
	}

	gtfoClearElement(images);
	images.appendChild(gtfoCreateImagesLayout());

	var toolbar = document.getElementById('gtfo-images-toolbar');
	var grid = document.getElementById('gtfo-image-grid');
	var layout = document.getElementById('gtfo-images-layout');
	var pages = document.getElementById('gtfo-images-pages');
	var previousButton = document.getElementById('gtfo-images-prev');
	var nextButton = document.getElementById('gtfo-images-next');
	var contextMenu = document.getElementById('gtfo-image-context-menu');
	var infoOverlay = document.getElementById('gtfo-image-info-overlay');
	var infoText = document.getElementById('gtfo-image-info-text');
	var infoTitleText = document.getElementById('gtfo-image-info-title-text');
	var viewOverlay = document.getElementById('gtfo-image-view-overlay');
	var viewImage = document.getElementById('gtfo-image-view-image');
	var contextImageInfo = null;

	function getImagesPerPage() {
		return activeGridSize.columns * activeGridSize.rows;
	}

	function renderToolbar() {
		gtfoClearElement(toolbar);

		for (let gridSize of gridSizes) {
			var button = document.createElement('button');
			button.className = gridSize == activeGridSize ? 'gtfo-image-size-button gtfo-image-size-active' : 'gtfo-image-size-button';
			button.type = 'button';
			button.textContent = gridSize.label;
			button.addEventListener('click', () => {
				activeGridSize = gridSize;
				activePage = 0;
				renderImages();
			});
			toolbar.appendChild(button);
		}

		var showAllButton = document.createElement('button');
		showAllButton.className = showAllImages ? 'gtfo-image-mode-button gtfo-image-mode-active' : 'gtfo-image-mode-button';
		showAllButton.type = 'button';
		showAllButton.textContent = 'Show all';
		showAllButton.addEventListener('click', () => {
			showAllImages = !showAllImages;
			activePage = 0;
			renderImages();
		});
		toolbar.appendChild(showAllButton);

		var actions = document.createElement('div');
		actions.id = 'gtfo-images-actions';

		var selectAllButton = document.createElement('button');
		var allSelected = imageList.every((imageInfo) => imageInfo.selected);
		selectAllButton.className = allSelected ? 'gtfo-image-select-all-button gtfo-image-select-all-active' : 'gtfo-image-select-all-button';
		selectAllButton.id = 'gtfo-select-all-images';
		selectAllButton.type = 'button';
		selectAllButton.textContent = 'Select all';
		selectAllButton.addEventListener('click', () => {
			var selectEverything = !imageList.every((imageInfo) => imageInfo.selected);
			imageList.forEach((imageInfo) => imageInfo.selected = selectEverything);
			renderImages();
		});

		var downloadButton = document.createElement('button');
		downloadButton.className = 'gtfo-image-download-button';
		downloadButton.type = 'button';
		downloadButton.textContent = 'Download selected';
		downloadButton.addEventListener('click', () => gtfoDownloadSelectedImages());

		actions.appendChild(selectAllButton);
		actions.appendChild(downloadButton);
		toolbar.appendChild(actions);
	}

	function renderPages(pageCount) {
		gtfoClearElement(pages);

		if (pageCount <= 1)
			return;

		for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
			var button = document.createElement('button');
			button.className = pageIndex == activePage ? 'gtfo-image-page-button gtfo-image-page-active' : 'gtfo-image-page-button';
			button.type = 'button';
			button.textContent = String(pageIndex + 1);
			button.addEventListener('click', () => {
				activePage = pageIndex;
				renderImages();
			});
			pages.appendChild(button);
		}
	}

	function closeImageContextMenu() {
		contextMenu.classList.remove('gtfo-context-menu-open');
		contextImageInfo = null;
	}

	function openImageContextMenu(event, imageInfo) {
		event.preventDefault();
		contextImageInfo = imageInfo;
		contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 170)}px`;
		contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 120)}px`;
		contextMenu.classList.add('gtfo-context-menu-open');
	}

	function goToImagePage(pageIndex) {
		var imagesPerPage = getImagesPerPage();
		var pageCount = Math.max(1, Math.ceil(imageList.length / imagesPerPage));

		activePage = Math.max(0, Math.min(pageIndex, pageCount - 1));
		renderImages();
	}

	function renderImages() {
		var imagesPerPage = getImagesPerPage();
		var pageCount = Math.max(1, Math.ceil(imageList.length / imagesPerPage));
		activePage = Math.min(activePage, pageCount - 1);
		var shownImages = showAllImages ? imageList : imageList.slice(activePage * imagesPerPage, (activePage + 1) * imagesPerPage);

		gtfoClearElement(grid);
		layout.classList.toggle('gtfo-images-show-all', showAllImages);
		grid.style.gridTemplateColumns = `repeat(${activeGridSize.columns}, minmax(0, 1fr))`;
		grid.style.gridTemplateRows = showAllImages ? 'none' : `repeat(${activeGridSize.rows}, minmax(0, 1fr))`;
		grid.style.gridAutoRows = showAllImages ? `calc((100% - ${8 * (activeGridSize.rows - 1)}px) / ${activeGridSize.rows})` : '';

		for (let imageInfo of shownImages) {
			var card = gtfoAppendImageCard(grid, imageInfo);
			card.addEventListener('contextmenu', (event) => openImageContextMenu(event, imageInfo));
			card.querySelector('.gtfo-image-select').addEventListener('change', (event) => {
				imageInfo.selected = event.target.checked;
				var selectAll = document.getElementById('gtfo-select-all-images');
				if (selectAll) {
					var allSelected = imageList.every((item) => item.selected);
					selectAll.classList.toggle('gtfo-image-select-all-active', allSelected);
				}
			});
		}

		renderToolbar();
		renderPages(showAllImages ? 1 : pageCount);

		previousButton.classList.toggle('gtfo-image-nav-hidden', showAllImages || activePage == 0);
		nextButton.classList.toggle('gtfo-image-nav-hidden', showAllImages || activePage >= pageCount - 1);
	}

	previousButton.addEventListener('click', () => goToImagePage(activePage - 1));
	nextButton.addEventListener('click', () => goToImagePage(activePage + 1));

	async function gtfoDownloadImage(imageInfo) {
		var downloadName = gtfoBuildImageDownloadName(host, imageInfo);
		var link = document.createElement('a');
		link.download = downloadName;

		try {
			var response = await fetch(imageInfo.url);
			if (!response.ok)
				throw new Error(`HTTP ${response.status}`);

			var blob = await response.blob();
			var objectUrl = URL.createObjectURL(blob);
			link.href = objectUrl;
			link.click();
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
		}
		catch (error) {
			console.warn('GTFO image download fallback used.', error);
			link.href = imageInfo.url;
			link.click();
		}
	}

	async function gtfoDownloadSelectedImages() {
		var selectedImages = imageList.filter((imageInfo) => imageInfo.selected);

		for (let imageInfo of selectedImages)
			await gtfoDownloadImage(imageInfo);
	}

	function gtfoViewImage(imageInfo) {
		viewImage.src = imageInfo.url;
		viewImage.alt = imageInfo.name;
		viewOverlay.classList.add('gtfo-image-view-open');
	}

	async function gtfoCopyImage(imageInfo) {
		var blob = await gtfoGetImageBlob(imageInfo);
		var mimeType = blob.type || `image/${gtfoGetImageType(imageInfo.image)}`;

		if (typeof ClipboardItem == 'function' && navigator.clipboard && navigator.clipboard.write) {
			try {
				await navigator.clipboard.write([
					new ClipboardItem({ [mimeType]: blob })
				]);
				return;
			}
			catch (error) {
				if (mimeType == 'image/png')
					throw error;
			}

			var bitmap = await createImageBitmap(blob);
			var canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			canvas.getContext('2d').drawImage(bitmap, 0, 0);
			var pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': pngBlob })
			]);
			return;
		}

		throw new Error('Image clipboard API is not available.');
	}

	async function gtfoBuildImageInfo(imageInfo) {
		var blob = await gtfoGetImageBlob(imageInfo);
		if (!imageInfo.dimensions && typeof createImageBitmap == 'function') {
			try {
				var bitmap = await createImageBitmap(blob);
				imageInfo.dimensions = `${bitmap.width} x ${bitmap.height}`;
			}
			catch (error) {
				console.warn('GTFO could not read image dimensions from blob.', error);
			}
		}
		var hashes = await gtfoHashBlobInWorker(blob);
		var downloadName = gtfoBuildImageDownloadName(host, imageInfo);
		var type = blob.type || `image/${gtfoGetImageType(imageInfo.image)}`;
		var headers = imageInfo.headers || {};

		return [
			`Name: ${imageInfo.name}`,
			`Download name: ${downloadName}`,
			`URL: ${imageInfo.url}`,
			`Dimensions: ${imageInfo.dimensions || 'unknown'}`,
			`Type: ${type}`,
			`Size: ${gtfoFormatBytes(blob.size)}`,
			`Bytes: ${blob.size}`,
			`Content-Type: ${headers.contentType || 'unknown'}`,
			`Content-Length: ${headers.contentLength || 'unknown'}`,
			`Last-Modified: ${headers.lastModified || 'unknown'}`,
			`Cache-Control: ${headers.cacheControl || 'unknown'}`,
			`ETag: ${headers.etag || 'unknown'}`,
			`MD5: ${hashes.md5}`,
			`SHA-1: ${hashes.sha1}`,
			`SHA-256: ${hashes.sha256}`
		].join('\n');
	}

	async function gtfoInspectImage(imageInfo) {
		infoTitleText.textContent = imageInfo.name;
		infoText.value = 'Loading image info and hashes...';
		infoOverlay.classList.add('gtfo-image-info-open');

		try {
			infoText.value = await gtfoBuildImageInfo(imageInfo);
		}
		catch (error) {
			infoText.value = `Could not load image info.\n\n${error.message || error}\n\nURL: ${imageInfo.url}`;
		}
	}

	contextMenu.addEventListener('click', async (event) => {
		var item = event.target.closest('.gtfo-image-context-item');
		if (!item || !contextImageInfo)
			return;

		var imageInfo = contextImageInfo;
		closeImageContextMenu();

		try {
			if (item.dataset.action == 'view')
				gtfoViewImage(imageInfo);
			else if (item.dataset.action == 'save')
				await gtfoDownloadImage(imageInfo);
			else if (item.dataset.action == 'copy')
				await gtfoCopyImage(imageInfo);
			else if (item.dataset.action == 'inspect')
				await gtfoInspectImage(imageInfo);
		}
		catch (error) {
			console.warn('GTFO image context action failed.', error);
			alert(error.message || error);
		}
	});

	document.addEventListener('click', closeImageContextMenu);
	document.addEventListener('keydown', (event) => {
		if (event.key == 'Escape') {
			closeImageContextMenu();
			infoOverlay.classList.remove('gtfo-image-info-open');
			viewOverlay.classList.remove('gtfo-image-view-open');
		}
	});
	document.getElementById('gtfo-image-info-close').addEventListener('click', () => infoOverlay.classList.remove('gtfo-image-info-open'));
	document.getElementById('gtfo-image-info-copy').addEventListener('click', () => navigator.clipboard.writeText(infoText.value));
	document.getElementById('gtfo-image-view-close').addEventListener('click', () => viewOverlay.classList.remove('gtfo-image-view-open'));
	viewOverlay.addEventListener('click', (event) => {
		if (event.target == viewOverlay)
			viewOverlay.classList.remove('gtfo-image-view-open');
	});

	renderImages();
}

function gtfoSetLoadingProgress(session) {
	var loading = document.getElementById('gtfo-loading');
	var progressBar = document.getElementById('gtfo-loading-progress');
	var percent = document.getElementById('gtfo-loading-percent');
	var lines = document.getElementById('gtfo-loading-lines');
	if (!loading || !session)
		return;

	gtfoLatestSession = session;
	var progress = Math.max(0, Math.min(100, Number(session.progress) || 0));
	progressBar.style.width = `${progress}%`;
	percent.textContent = `${Math.round(progress)}%`;
	var outputLines = Array.isArray(session.lines) && session.lines.length > 0 ? session.lines : [session.line || 'Waiting for page scan'];
	lines.textContent = outputLines.map((line) => `> ${line}`).join('\n');
	lines.scrollTop = lines.scrollHeight;
	gtfoUpdatePendingTabs(session);
	loading.classList.toggle('gtfo-loading-active', progress < 100 || session.status == 'error');
}

function gtfoFinishLoading() {
	var loading = document.getElementById('gtfo-loading');
	var progressBar = document.getElementById('gtfo-loading-progress');
	var percent = document.getElementById('gtfo-loading-percent');
	if (progressBar)
		progressBar.style.width = '100%';
	if (percent)
		percent.textContent = '100%';
	if (loading)
		setTimeout(() => loading.classList.remove('gtfo-loading-active'), 180);
}

function gtfoMergeReportData(currentData, nextData) {
	if (!currentData)
		return nextData;
	if (!nextData)
		return currentData;

	return {
		...currentData,
		...nextData,
		html: nextData.html || currentData.html,
		comments: nextData.comments || currentData.comments,
		js: Array.isArray(nextData.js) && nextData.js.length > 0 ? nextData.js : currentData.js,
		css: Array.isArray(nextData.css) && nextData.css.length > 0 ? nextData.css : currentData.css,
		urls: Array.isArray(nextData.urls) && nextData.urls.length > 0 ? nextData.urls : currentData.urls,
		images: Array.isArray(nextData.images) && nextData.images.length > 0 ? nextData.images : currentData.images
	};
}

function gtfoRender(data, preferredTab) {
	var host = gtfoGetHost(data);
	var pageUrl = gtfoGetPageUrl(data);
	preferredTab = preferredTab || 'Urls';
	gtfoCurrentReportData = data;

	document.title = `GTFO: ${host}`;
	gtfoCurrentPageUrl = pageUrl;
	gtfoAppendReportMeta(document.getElementById('gtfo-report-meta'), host, pageUrl);

	var builtTabs = new Set();
	var tabBuilders = {
		Page: () => gtfoBuildPage(gtfoCurrentReportData),
		Urls: () => gtfoBuildUrls(gtfoCurrentReportData),
		Sources: () => gtfoBuildComments(gtfoCurrentReportData),
		Images: () => gtfoBuildImages(gtfoCurrentReportData)
	};

	function ensureTabBuilt(tabName) {
		if (builtTabs.has(tabName) || !tabBuilders[tabName])
			return;
		if (!gtfoTabHasRequiredData(gtfoCurrentReportData, tabName)) {
			gtfoShowPendingTab(tabName, gtfoLatestSession);
			return;
		}
		if (document.getElementById(tabName).hasChildNodes()) {
			builtTabs.add(tabName);
			return;
		}

		tabBuilders[tabName]();
		builtTabs.add(tabName);
	}

	document.querySelectorAll('.gtfo-tab-button').forEach((button) => {
		button.addEventListener('click', () => {
			ensureTabBuilt(button.dataset.tab);
			gtfoSwitchTab(button.dataset.tab);
		});
	});

	ensureTabBuilt(preferredTab);
	gtfoSwitchTab(preferredTab);
	gtfoFinishLoading();

	if (data.partial)
		return;

	['Urls', 'Sources', 'Images', 'Page'].forEach((tabName, index) => {
		if (tabName == preferredTab)
			return;

		setTimeout(() => ensureTabBuilt(tabName), 150 + (index * 180));
	});
}

var gtfoHasRendered = false;
var gtfoPreferredTab = 'Urls';
var gtfoRenderedPartial = false;
var gtfoPendingTabs = new Set();
var gtfoLatestSession = null;

function gtfoTabHasRequiredData(data, tabName) {
	if (!data)
		return false;

	if (tabName == 'Urls')
		return Array.isArray(data.urls);
	if (tabName == 'Images')
		return Array.isArray(data.images);
	if (tabName == 'Sources')
		return !!data.pageHtml || (Array.isArray(data.js) && data.js.length > 0) || (Array.isArray(data.css) && data.css.length > 0);
	if (tabName == 'Page')
		return !!data.pageHtml || !data.partial;

	return true;
}

function gtfoShowPendingTab(tabName, session) {
	var tab = document.getElementById(tabName);
	if (!tab)
		return;

	gtfoPendingTabs.add(tabName);
	gtfoClearElement(tab);

	var wrapper = document.createElement('div');
	wrapper.className = 'gtfo-tab-loading';

	var inner = document.createElement('div');
	inner.className = 'gtfo-tab-loading-inner';

	var title = document.createElement('div');
	title.className = 'gtfo-tab-loading-title';
	title.textContent = `${tabName} data is still loading`;

	var status = document.createElement('div');
	status.className = 'gtfo-tab-loading-status';
	status.textContent = gtfoFormatPendingStatus(session);

	inner.appendChild(title);
	inner.appendChild(status);
	wrapper.appendChild(inner);
	tab.appendChild(wrapper);
}

function gtfoUpdatePendingTabs(session) {
	for (let tabName of gtfoPendingTabs) {
		var tab = document.getElementById(tabName);
		var status = tab && tab.querySelector('.gtfo-tab-loading-status');
		if (status)
			status.textContent = gtfoFormatPendingStatus(session);
	}
}

function gtfoFormatPendingStatus(session) {
	var progress = session && Number.isFinite(Number(session.progress)) ? `${Math.round(Number(session.progress))}%` : '--%';
	var outputLines = session && Array.isArray(session.lines) && session.lines.length > 0 ? session.lines.slice(-6) : [(session && session.line) || 'Waiting for collection progress'];
	return [`Progress: ${progress}`].concat(outputLines.map((line) => `> ${line}`)).join('\n');
}

function gtfoRefreshReportData(data, session) {
	gtfoCurrentReportData = gtfoMergeReportData(gtfoCurrentReportData, data);
	gtfoPreferredTab = (session && session.preferredTab) || gtfoPreferredTab || 'Urls';

	if (!data || data.partial)
		return;

	if (gtfoRenderedPartial) {
		['Urls', 'Sources', 'Images', 'Page'].forEach((tabName) => {
			var tabElement = document.getElementById(tabName);
			if (!tabElement || !tabElement.hasChildNodes())
				return;

			gtfoClearElement(tabElement);
			gtfoRenderTab(tabName);
			gtfoPendingTabs.delete(tabName);
		});
	}
	gtfoRenderedPartial = false;

	['Urls', 'Sources', 'Images', 'Page'].forEach((tabName, index) => {
		setTimeout(() => {
			if (!document.getElementById(tabName).hasChildNodes())
				gtfoRenderTab(tabName);
			gtfoPendingTabs.delete(tabName);
		}, 150 + (index * 180));
	});
}

function gtfoRenderTab(tabName) {
	if (!gtfoCurrentReportData)
		return;

	if (tabName == 'Page')
		gtfoBuildPage(gtfoCurrentReportData);
	else if (tabName == 'Urls')
		gtfoBuildUrls(gtfoCurrentReportData);
	else if (tabName == 'Sources')
		gtfoBuildComments(gtfoCurrentReportData);
	else if (tabName == 'Images')
		gtfoBuildImages(gtfoCurrentReportData);

	gtfoPendingTabs.delete(tabName);
}

async function gtfoTryRenderSession(session) {
	if (!session)
		return false;

	gtfoSetLoadingProgress(session);
	if (session.data || session.dataReady) {
		var data = session.data;
		if (!data) {
			var result = await browser.storage.local.get('gtfo_grabber_data');
			data = result.gtfo_grabber_data;
		}

		if (!data)
			return false;

		if (gtfoHasRendered) {
			gtfoRefreshReportData(data, session);
			return true;
		}

		gtfoCurrentReportData = gtfoMergeReportData(gtfoCurrentReportData, data);
		gtfoHasRendered = true;
		gtfoPreferredTab = session.preferredTab || 'Urls';
		gtfoRenderedPartial = !!data.partial;
		session.progress = data.partial ? session.progress : 100;
		gtfoSetLoadingProgress(session);
		gtfoRender(gtfoCurrentReportData, gtfoPreferredTab);
		return true;
	}

	return false;
}

browser.storage.onChanged.addListener((changes, areaName) => {
	if (areaName != 'local' || !changes.gtfo_grabber_session)
		return;

	gtfoTryRenderSession(changes.gtfo_grabber_session.newValue);
});

browser.storage.onChanged.addListener((changes, areaName) => {
	if (areaName != 'local' || !changes.gtfo_grabber_data || !gtfoHasRendered)
		return;

	var nextData = changes.gtfo_grabber_data.newValue;
	gtfoCurrentReportData = gtfoMergeReportData(gtfoCurrentReportData, nextData);
	if (nextData && !nextData.partial)
		gtfoRefreshReportData(nextData, null);
});

browser.storage.local.get(['gtfo_grabber_session', 'gtfo_grabber_data']).then(async (result) => {
	if (await gtfoTryRenderSession(result.gtfo_grabber_session))
		return;

	if (result.gtfo_grabber_session && result.gtfo_grabber_session.status == 'loading')
		return;

	if (result.gtfo_grabber_data) {
		gtfoHasRendered = true;
		gtfoRender(result.gtfo_grabber_data, 'Urls');
	}
	else {
		gtfoSetLoadingProgress({
			progress: 0,
			lines: ['no active grabber session found']
		});
		document.getElementById('gtfo-report-meta').textContent = 'No GTFO data found.';
	}
});
