importScripts(
	'vendor/js-beautify/beautify.min.js',
	'vendor/js-beautify/beautify-css.min.js',
	'vendor/js-beautify/beautify-html.min.js',
	'vendor/highlight.js/highlight.min.js'
);

var gtfoSyntaxHighlightCache = new Map();
var gtfoSyntaxHighlightCacheLimit = 20000;

function gtfoEscapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
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
		highlighted = '';
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
			return { start: lineIndex, end: endIndex };
	}

	return null;
}

function gtfoGetCodeCommentRanges(lines, sourceType) {
	var ranges = [];
	var state = 'code';
	var stringReturnState = 'code';
	var regexReturnState = 'code';
	var regexInCharacterClass = false;
	var templateExpressionDepth = 0;
	var blockStartLine = 0;
	var blockText = '';

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
					ranges.push({ start: lineIndex, end: lineIndex, text: line.slice(index) });
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
					ranges.push({ start: lineIndex, end: lineIndex, text: line.slice(index) });
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
					ranges.push({ start: blockStartLine, end: lineIndex, text: blockText });
					blockText = '';
					state = returnToCodeState();
					index++;
				}
			}
		}

		if (state == 'regex')
			state = regexReturnState;
	}

	return ranges;
}

function gtfoFindCodeCommentRange(lines, comment, sourceType) {
	var normalizedComment = gtfoNormalizeCommentText(comment, sourceType);
	if (!normalizedComment)
		return null;

	for (let range of gtfoGetCodeCommentRanges(lines, sourceType)) {
		var normalizedSourceComment = gtfoNormalizeCommentText(range.text, sourceType);
		if (normalizedSourceComment == normalizedComment || normalizedSourceComment.includes(normalizedComment))
			return { start: range.start, end: range.end };
	}

	return null;
}

function gtfoFindCommentRange(lines, comment, sourceType) {
	if (!comment)
		return null;
	if (sourceType == 'html')
		return gtfoFindHtmlCommentRange(lines, comment);
	if (sourceType == 'javascript' || sourceType == 'css')
		return gtfoFindCodeCommentRange(lines, comment, sourceType);
	return null;
}

function gtfoBuildCommentLineSet(lines, comments, sourceType) {
	var lineSet = new Set();

	for (let comment of comments || []) {
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

	for (let character of match[0])
		indent += character == '\t' ? 2 : 1;

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
	var ranges = [];

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
			ranges.push([index, end]);
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
		return source;
	}

	return source;
}

function gtfoBufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
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

function gtfoMd5Buffer(buffer) {
	var bytes = new Uint8Array(buffer);
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

async function gtfoHashBuffer(buffer) {
	var sha1 = await crypto.subtle.digest('SHA-1', buffer.slice(0));
	var sha256 = await crypto.subtle.digest('SHA-256', buffer.slice(0));

	return {
		md5: gtfoMd5Buffer(buffer),
		sha1: gtfoBufferToHex(sha1),
		sha256: gtfoBufferToHex(sha256)
	};
}

function gtfoAnalyzeSource(payload) {
	var sourceType = payload.sourceType || 'javascript';
	var source = payload.prettify ? gtfoFormatSource(payload.source || '', sourceType) : String(payload.source || '');
	var lines = source.split(/\r?\n/);

	return {
		source: source,
		lines: lines,
		highlightedLines: lines.map((line) => gtfoHighlightSyntax(line, sourceType) || ' '),
		selectedLineIndexes: Array.from(gtfoBuildCommentLineSet(lines, payload.selectedComments || [], sourceType)),
		scrollRange: gtfoFindCommentRange(lines, payload.scrollComment, sourceType),
		foldRanges: gtfoBuildFoldRanges(lines, sourceType)
	};
}

self.addEventListener('message', async (event) => {
	var request = event.data || {};

	try {
		var result;
		if (request.type == 'analyzeSource')
			result = gtfoAnalyzeSource(request.payload || {});
		else if (request.type == 'hashBuffer')
			result = await gtfoHashBuffer((request.payload || {}).buffer);
		else
			throw new Error(`Unknown worker task: ${request.type}`);

		self.postMessage({
			id: request.id,
			ok: true,
			result: result
		});
	}
	catch (error) {
		self.postMessage({
			id: request.id,
			ok: false,
			error: error.message || String(error)
		});
	}
});
