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
		urls = urls.concat(data.js.map((item) => item.url));

	if (Array.isArray(data.css))
		urls = urls.concat(data.css.map((item) => item.url));

	if (Array.isArray(data.images))
		urls = urls.concat(data.images);

	urls = urls.filter((url) => !!url);
	urls = [...new Set(urls)];
	urls.sort();
	return urls;
}

function gtfoGetCommentGroups(data) {
	var groups = [];

	if (data.html)
		groups.push({
			title: `HTML: ${data.html.name || 'Page'}`,
			source: data.html.source || data.pageHtml || '',
			comments: data.html.comments || []
		});
	else if (data.comments)
		groups.push({
			title: 'HTML',
			source: data.pageHtml || '',
			comments: data.comments.html || []
		});

	if (Array.isArray(data.js)) {
		for (let script of data.js)
			groups.push({
				title: `JavaScript: ${script.url || 'Page'}`,
				source: script.source || '',
				comments: script.comments || []
			});
	}
	else if (data.comments) {
		groups.push({
			title: 'JavaScript',
			source: '',
			comments: data.comments.javascript || []
		});
	}

	if (Array.isArray(data.css)) {
		for (let stylesheet of data.css)
			groups.push({
				title: `CSS: ${stylesheet.url || 'Stylesheet'}`,
				source: stylesheet.source || '',
				comments: stylesheet.comments || []
			});
	}

	return groups;
}

function gtfoGetSourceType(group) {
	if (group.title.startsWith('HTML:'))
		return 'html';
	if (group.title.startsWith('CSS:'))
		return 'css';
	return 'javascript';
}

function gtfoHighlightSyntax(line, sourceType) {
	var language = sourceType == 'html' ? 'xml' : sourceType;

	try {
		if (typeof hljs == 'object' && hljs.getLanguage(language))
			return hljs.highlight(line, { language: language, ignoreIllegals: true }).value;
	}
	catch (error) {
		console.warn('GTFO highlighter failed, showing escaped source.', error);
	}

	return gtfoEscapeHtml(line);
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

function gtfoBuildPage(data) {
	var page = document.getElementById('Page');
	var iframe = document.createElement('iframe');
	iframe.setAttribute('sandbox', '');
	iframe.srcdoc = data.pageHtml || `<a href="${gtfoEscapeHtml(gtfoGetPageUrl(data))}">${gtfoEscapeHtml(gtfoGetPageUrl(data))}</a>`;
	page.appendChild(iframe);
}

function gtfoBuildUrls(data) {
	var urls = gtfoGetUrls(data);
	var urlContainer = document.getElementById('Urls');
	var toolbar = document.createElement('div');
	toolbar.id = 'gtfo-urls-toolbar';
	toolbar.innerHTML = '<button class="gtfo-tool-button" id="gtfo-copy-urls">Copy</button><button class="gtfo-tool-button" id="gtfo-save-urls">Save</button><label><input type="checkbox" id="gtfo-select-all"> Select all</label>';
	urlContainer.appendChild(toolbar);

	urls.forEach((url, index) => {
		var row = document.createElement('div');
		row.className = 'gtfo-url-row';
		row.innerHTML = '<input class="gtfo-url-input" type="checkbox" value="' + gtfoEscapeHtml(url) + '"><a href="' + gtfoEscapeHtml(url) + '">' + String(index + 1).padStart(String(urls.length).length, '0') + ': ' + gtfoEscapeHtml(url) + '</a>';
		urlContainer.appendChild(row);
	});

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
	var comments = document.getElementById('Comments');
	var groups = gtfoGetCommentGroups(data);
	var activeGroup = null;
	var prettifySource = false;
	var foldedLinesBySource = new Map();

	comments.innerHTML = '<div id="gtfo-comments-layout"><div id="gtfo-comments-nav"></div><div id="gtfo-source-panel"><div id="gtfo-source-title"><span id="gtfo-source-title-text"></span><label id="gtfo-source-actions"><input type="checkbox" id="gtfo-prettify-source"> Prettify</label></div><pre id="gtfo-source-code"></pre></div></div>';

	var nav = document.getElementById('gtfo-comments-nav');
	document.getElementById('gtfo-prettify-source').addEventListener('change', (event) => {
		prettifySource = event.target.checked;
		if (activeGroup)
			renderSource(activeGroup, gtfoGetSelectedCommentsForGroup(activeGroup), true);
	});

	function gtfoGetSelectedCommentsForGroup(group) {
		return Array.from(document.querySelectorAll('.gtfo-comment-active'))
			.filter((item) => item.gtfoGroup == group)
			.map((item) => item.gtfoComment);
	}

	function gtfoClearSelections() {
		document.querySelectorAll('.gtfo-comment-list li').forEach((item) => item.classList.remove('gtfo-comment-active'));
	}

	function gtfoGetFoldStateKey(group) {
		return `${group.title}::${prettifySource ? 'pretty' : 'raw'}`;
	}

	function renderSource(group, selectedComments, keepScroll, scrollComment) {
		var sourceTitle = document.getElementById('gtfo-source-title-text');
		var sourceCode = document.getElementById('gtfo-source-code');
		var sourcePanel = document.getElementById('gtfo-source-panel');
		var sourceType = gtfoGetSourceType(group);
		var rawSource = group.source || 'Source was not available for this subject.';
		var source = prettifySource ? gtfoFormatSource(rawSource, sourceType) : rawSource;
		selectedComments = selectedComments || [];
		var lines = source.split(/\r?\n/);
		var selectedLineIndexes = gtfoBuildCommentLineSet(lines, selectedComments, sourceType);
		var scrollRange = gtfoFindCommentRange(lines, scrollComment, sourceType);
		var foldRanges = gtfoBuildFoldRanges(lines, sourceType);
		var foldStateKey = gtfoGetFoldStateKey(group);
		var foldedLines = foldedLinesBySource.get(foldStateKey) || new Set();
		var lineNumberWidth = String(lines.length).length;
		var previousScrollTop = sourcePanel.scrollTop;
		var previousScrollLeft = sourcePanel.scrollLeft;

		if (scrollRange) {
			for (let [foldStart, foldEnd] of foldRanges) {
				if (foldStart < scrollRange.start && foldEnd >= scrollRange.start)
					foldedLines.delete(foldStart);
			}
		}

		sourceTitle.textContent = group.title;
		sourceCode.innerHTML = '';

		function applyFoldVisibility() {
			var rows = sourceCode.querySelectorAll('.gtfo-source-line');

			rows.forEach((row) => {
				var lineIndex = Number(row.dataset.lineIndex);
				var hidden = false;

				for (let [foldStart, foldEnd] of foldRanges) {
					if (foldedLines.has(foldStart) && lineIndex > foldStart && lineIndex <= foldEnd) {
						hidden = true;
						break;
					}
				}

				row.classList.toggle('gtfo-source-hidden', hidden);
				row.classList.toggle('gtfo-source-folded', foldedLines.has(lineIndex));

				var toggle = row.querySelector('.gtfo-fold-toggle');
				if (toggle)
					toggle.textContent = foldedLines.has(lineIndex) ? '>' : 'v';
			});
		}

		lines.forEach((line, index) => {
			var lineElement = document.createElement('div');
			var lineMatches = selectedLineIndexes.has(index);
			var scrollMatch = scrollRange && index == scrollRange.start;
			lineElement.className = lineMatches ? 'gtfo-source-line gtfo-source-highlight' : 'gtfo-source-line';
			lineElement.dataset.lineIndex = String(index);
			if (scrollMatch)
				lineElement.classList.add('gtfo-source-scroll-target');

			var lineNumber = document.createElement('span');
			lineNumber.className = 'gtfo-line-number';

			if (foldRanges.has(index)) {
				var foldToggle = document.createElement('button');
				foldToggle.className = 'gtfo-fold-toggle';
				foldToggle.type = 'button';
				foldToggle.title = 'Toggle fold';
				foldToggle.textContent = foldedLines.has(index) ? '>' : 'v';
				foldToggle.addEventListener('click', (event) => {
					event.preventDefault();
					event.stopPropagation();

					if (foldedLines.has(index))
						foldedLines.delete(index);
					else
						foldedLines.add(index);

					foldedLinesBySource.set(foldStateKey, foldedLines);
					applyFoldVisibility();
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
			lineCode.innerHTML = gtfoHighlightSyntax(line, sourceType) || ' ';

			lineElement.appendChild(lineNumber);
			lineElement.appendChild(lineCode);
			sourceCode.appendChild(lineElement);
		});

		applyFoldVisibility();
		foldedLinesBySource.set(foldStateKey, foldedLines);

		if (scrollRange) {
			var firstHighlight = sourceCode.querySelector('.gtfo-source-scroll-target') || sourceCode.querySelector('.gtfo-source-highlight');
			if (firstHighlight)
				gtfoScrollIntoViewIfNeeded(sourcePanel, firstHighlight);
		}
		else if (keepScroll) {
			sourcePanel.scrollTop = previousScrollTop;
			sourcePanel.scrollLeft = previousScrollLeft;
		}
		else {
			sourcePanel.scrollTop = 0;
			sourcePanel.scrollLeft = 0;
		}
	}

	function setActiveGroup(section, group) {
		document.querySelectorAll('.gtfo-comment-group').forEach((item) => item.classList.remove('gtfo-comment-group-active'));
		section.classList.add('gtfo-comment-group-active');
		activeGroup = group;
		renderSource(group, gtfoGetSelectedCommentsForGroup(group));
	}

	function setActiveComment(event, item, section, group, comment) {
		var multiSelect = item.dataset.gtfoMultiSelect == 'true' || event.altKey || event.getModifierState('Alt');
		item.dataset.gtfoMultiSelect = 'false';

		if (multiSelect) {
			event.preventDefault();
			event.stopPropagation();
		}

		document.querySelectorAll('.gtfo-comment-group').forEach((item) => item.classList.remove('gtfo-comment-group-active'));

		section.classList.add('gtfo-comment-group-active');
		activeGroup = group;

		if (multiSelect) {
			item.classList.toggle('gtfo-comment-active');
		}
		else {
			gtfoClearSelections();
			item.classList.add('gtfo-comment-active');
		}

		if (multiSelect)
			renderSource(group, gtfoGetSelectedCommentsForGroup(group), true, null);
		else
			renderSource(group, gtfoGetSelectedCommentsForGroup(group), false, comment);
	}

	for (let group of groups) {
		let section = document.createElement('section');
		section.className = 'gtfo-comment-group';
		section.innerHTML = '<h2>' + gtfoEscapeHtml(group.title) + '</h2>';
		section.querySelector('h2').addEventListener('click', () => setActiveGroup(section, group));

		let list = document.createElement('ul');
		list.className = 'gtfo-comment-list';
		if (group.comments.length == 0) {
			let empty = document.createElement('li');
			empty.className = 'gtfo-comment-empty';
			empty.textContent = 'No comments found';
			list.appendChild(empty);
		}
		else {
			for (let comment of group.comments) {
				let item = document.createElement('li');
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
				item.addEventListener('click', (event) => setActiveComment(event, item, section, group, comment));
				list.appendChild(item);
			}
		}

		section.appendChild(list);
		nav.appendChild(section);
	}

	if (groups.length > 0) {
		var firstSection = nav.querySelector('.gtfo-comment-group');
		setActiveGroup(firstSection, groups[0]);
	}
}

function gtfoBuildImages(data) {
	var images = document.getElementById('Images');
	var imageList = data.images || [];
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
		images.innerHTML = '<div class="gtfo-images-empty">No images found</div>';
		return;
	}

	images.innerHTML = '<div id="gtfo-images-layout"><div id="gtfo-images-toolbar"></div><div id="gtfo-images-stage"><button class="gtfo-image-nav-button gtfo-image-nav-prev" id="gtfo-images-prev" type="button">&lt;</button><div class="gtfo-image-grid" id="gtfo-image-grid"></div><button class="gtfo-image-nav-button gtfo-image-nav-next" id="gtfo-images-next" type="button">&gt;</button></div><div id="gtfo-images-pages"></div></div>';

	var toolbar = document.getElementById('gtfo-images-toolbar');
	var grid = document.getElementById('gtfo-image-grid');
	var layout = document.getElementById('gtfo-images-layout');
	var pages = document.getElementById('gtfo-images-pages');
	var previousButton = document.getElementById('gtfo-images-prev');
	var nextButton = document.getElementById('gtfo-images-next');

	function getImagesPerPage() {
		return activeGridSize.columns * activeGridSize.rows;
	}

	function renderToolbar() {
		toolbar.innerHTML = '';

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
	}

	function renderPages(pageCount) {
		pages.innerHTML = '';

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

		grid.innerHTML = '';
		layout.classList.toggle('gtfo-images-show-all', showAllImages);
		grid.style.gridTemplateColumns = `repeat(${activeGridSize.columns}, minmax(0, 1fr))`;
		grid.style.gridTemplateRows = showAllImages ? 'none' : `repeat(${activeGridSize.rows}, minmax(0, 1fr))`;
		grid.style.gridAutoRows = showAllImages ? `calc((100% - ${8 * (activeGridSize.rows - 1)}px) / ${activeGridSize.rows})` : '';

		for (let image of shownImages) {
			var card = document.createElement('div');
			card.className = 'gtfo-image-card';
			card.innerHTML = '<img src="' + gtfoEscapeHtml(image) + '" alt=""><a href="' + gtfoEscapeHtml(image) + '">' + gtfoEscapeHtml(image) + '</a>';
			grid.appendChild(card);
		}

		renderToolbar();
		renderPages(showAllImages ? 1 : pageCount);

		previousButton.classList.toggle('gtfo-image-nav-hidden', showAllImages || activePage == 0);
		nextButton.classList.toggle('gtfo-image-nav-hidden', showAllImages || activePage >= pageCount - 1);
	}

	previousButton.addEventListener('click', () => goToImagePage(activePage - 1));
	nextButton.addEventListener('click', () => goToImagePage(activePage + 1));

	renderImages();
}

function gtfoRender(data) {
	var host = gtfoGetHost(data);
	var pageUrl = gtfoGetPageUrl(data);

	document.title = `GTFO: ${host}`;
	document.getElementById('gtfo_embedded_data').value = JSON.stringify(data);
	document.getElementById('gtfo-report-meta').innerHTML = '<strong>' + gtfoEscapeHtml(host) + '</strong> - <a href="' + gtfoEscapeHtml(pageUrl) + '">' + gtfoEscapeHtml(pageUrl) + '</a>';

	document.querySelectorAll('.gtfo-tab-button').forEach((button) => {
		button.addEventListener('click', () => gtfoSwitchTab(button.dataset.tab));
	});

	gtfoBuildPage(data);
	gtfoBuildUrls(data);
	gtfoBuildComments(data);
	gtfoBuildImages(data);
	gtfoSwitchTab('Urls');
}

browser.storage.local.get('gtfo_grabber_data').then((result) => {
	if (result.gtfo_grabber_data)
		gtfoRender(result.gtfo_grabber_data);
	else
		document.getElementById('gtfo-report-meta').textContent = 'No GTFO data found.';
});
