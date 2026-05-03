importScripts(
	'comment-parser.js',
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

function gtfoGetIndentWidth(line) {
	var match = String(line || '').match(/^[\t ]*/);
	return match ? match[0].replace(/\t/g, '    ').length : 0;
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
