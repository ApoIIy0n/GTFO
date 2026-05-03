var gtfoCodeCommentRangeCache = typeof WeakMap == 'function' ? new WeakMap() : null;

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

function gtfoGetCommentLines(comment, sourceType) {
	return String(comment || '')
		.split(/\r?\n/)
		.map((line) => gtfoNormalizeCommentLine(line, sourceType))
		.filter((line) => line.length > 0);
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

function gtfoGetCodeCommentRanges(lines, sourceType) {
	if (gtfoCodeCommentRangeCache) {
		var cachedRangesByType = gtfoCodeCommentRangeCache.get(lines);
		if (cachedRangesByType && cachedRangesByType[sourceType])
			return cachedRangesByType[sourceType];
	}

	var ranges = [];
	var state = 'code';
	var stringReturnState = 'code';
	var regexReturnState = 'code';
	var regexInCharacterClass = false;
	var templateReturnStates = [];
	var templateExpressionStack = [];
	var blockStartLine = 0;
	var blockText = '';

	function cacheRanges() {
		if (gtfoCodeCommentRangeCache) {
			var cachedRangesByType = gtfoCodeCommentRangeCache.get(lines) || {};
			cachedRangesByType[sourceType] = ranges;
			gtfoCodeCommentRangeCache.set(lines, cachedRangesByType);
		}
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

	function enterTemplate(returnState) {
		templateReturnStates.push(returnState);
		state = 'template';
	}

	function enterTemplateExpression() {
		templateExpressionStack.push(1);
		state = 'template-expression';
	}

	function incrementTemplateExpressionDepth() {
		templateExpressionStack[templateExpressionStack.length - 1]++;
	}

	function decrementTemplateExpressionDepth() {
		var depth = templateExpressionStack.pop() - 1;
		if (depth > 0) {
			templateExpressionStack.push(depth);
			return;
		}
		state = 'template';
	}

	function returnToCodeState() {
		return sourceType == 'javascript' && templateExpressionStack.length > 0 ? 'template-expression' : 'code';
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
					enterTemplate('code');
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
					state = templateReturnStates.pop() || 'code';
				else if (character == '$' && nextCharacter == '{' && !isEscaped(line, index)) {
					enterTemplateExpression();
					index++;
				}
			}
			else if (state == 'template-expression') {
				if (character == '"' || character == "'") {
					stringReturnState = 'template-expression';
					state = character;
				}
				else if (character == '`')
					enterTemplate('template-expression');
				else if (character == '{')
					incrementTemplateExpressionDepth();
				else if (character == '}')
					decrementTemplateExpressionDepth();
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
	if (!comment)
		return null;
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

	for (let comment of comments || []) {
		var range = gtfoFindCommentRange(lines, comment, sourceType);
		if (!range)
			continue;

		for (let lineIndex = range.start; lineIndex <= range.end; lineIndex++)
			lineSet.add(lineIndex);
	}

	return lineSet;
}

function gtfoCollectCodeComments(source, sourceType) {
	var comments = [];
	var commentSet = new Set();
	var lines = String(source || '').split(/\r?\n/);

	for (let range of gtfoGetCodeCommentRanges(lines, sourceType)) {
		var comment = String(range.text || '').replace(/\t/g, '').trim();
		if (comment.endsWith(','))
			comment = comment.slice(0, -1);
		if (comment && !commentSet.has(comment)) {
			commentSet.add(comment);
			comments.push(comment);
		}
	}

	return comments;
}

function gtfo_GetCommentsFromData(data) {
	return gtfoCollectCodeComments(data, 'javascript');
}

function gtfo_GetCssCommentsFromData(data) {
	return gtfoCollectCodeComments(data, 'css');
}
