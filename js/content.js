var debugging = false;
var hostName = window.location.host.replace(/[^a-z0-9_-]/gi, '_');

var randomize = (n, r = '') => {
	while (n--) r += String.fromCharCode((r = Math.random() * 62 | 0, r += r > 9 ? (r < 36 ? 55 : 61) : 48));
	return r;
};

// set to a fixed string for now because of CSS styling
var randomString = 'GTFO-BODY';//randomize(Math.floor(Math.random() * (8 - 2 + 1) + 2));
var originalBackgroundColor, originalBackgroundImage;
var selectedImages = [];

function removeClassFromElements(className) {
	const foundElements = document.getElementsByClassName(className);

	for (let foundElement of foundElements) {
		foundElement.classList.remove(className);
	}
}

function gtfo_Unhide() {
	var body = document.querySelector('body');
	if (!body.classList.contains(randomString)) {
		body.style.removeProperty("visibility");
		removeClassFromElements("not-active");
		removeClassFromElements("hidden");
		body.classList.add(randomString);
	}
	else {
		alert("UnHide has already been executed!");
	}
}

function switchTab(tabName, elmnt) {
	var tabcontent = document.getElementsByClassName("tabcontent");

	if (tabName == 'Page') {
		if (originalBackgroundImage) {
			document.body.style.backgroundImage = originalBackgroundImage;
		}
		document.body.style.backgroundColor = originalBackgroundColor;
	}
	else {
		if (originalBackgroundImage) {
			document.body.style.backgroundImage = 'none';
		}
		document.body.style.backgroundColor = '#313131';
	}

	var tabButtons = document.getElementsByClassName('gtfo-tab-button');
	for (let tabButton of tabButtons) {
		if (tabButton.id.includes('activeTab'))
			tabButton.id = tabButton.id.replace('-activeTab', '');
		if (tabButton.textContent == tabName) {
			if (!tabButton.id.includes('activeTab'))
				tabButton.id = `${tabButton.id}-activeTab`;
		}
	}

	if (tabName == 'Page') {
		document.body.style.backgroundColor = originalBackgroundColor;
	}

	for (let tabitem of tabcontent) {
		tabitem.style.display = (tabitem.id == tabName) ? null : "none";
	}
}

function getElement(elmnt, elmntid, classlist, textcontent) {
	var returnElmnt = document.createElement(elmnt);
	if (elmntid)
		returnElmnt.id = elmntid;
	if (classlist)
		returnElmnt.className = classlist;
	if (textcontent)
		returnElmnt.textContent = textcontent;

	return returnElmnt;
}

function gtfo_GetErrorDiv(tabName, error) {
	var errorDiv = getPageDiv(tabName, null, null);
	var message = getElement('div', null, null, `GTFO could not load ${tabName}: ${error.message || error}`);
	message.style.color = 'white';
	message.style.fontFamily = 'Consolas, consolas';
	message.style.fontSize = '12px';
	message.style.padding = '10px';
	errorDiv.appendChild(message);
	return errorDiv;
}

function getPageButton(name, enabled, className) {
	var pageButton = getElement('button', `${className}-${name}`, className, name);

	if (!enabled)
		pageButton.setAttribute('disabled', true);

	pageButton.onclick = function () { switchTab(name, this); }

	return pageButton;
}

function getPageDiv(name, style, innerhtml) {
	var pageDiv = getElement('div', name, 'tabcontent', null);

	if (style)
		pageDiv.setAttribute('style', style);
	if (innerhtml) {
		var iframe = getElement('iframe', null, null, null);
		iframe.setAttribute('sandbox', '');
		iframe.srcdoc = innerhtml;
		pageDiv.appendChild(iframe);
	}

	return pageDiv;
}

function toggleInput(name, elmnt) {
	var elmntId = elmnt.id;
	if (elmntId.includes('-') && name.includes('*')) {
		const elmntArray = elmntId.split('-');
		var lastElmnt = elmntArray[elmntArray.length - 1];
		if (!isNaN(lastElmnt)) {
			var toggleId = name.replace('*', lastElmnt);
			var inputElmnt = document.getElementById(toggleId);
			if (inputElmnt) {
				inputElmnt.checked = !inputElmnt.checked;
			}
		}
	}
}

function gtfo_Grabber_SelectAll(elmnt) {
	var checkBoxes = document.getElementsByClassName('gtfo-tab-input');

	for (let checkBox of checkBoxes) {
		checkBox.checked = elmnt.checked;
	}
}

function gtfo_Grabber_GetSelectedUrls() {
	var checkBoxes = document.getElementsByClassName('gtfo-tab-input');

	var selectedItems = [];

	for (let checkBox of checkBoxes) {
		if (checkBox.checked) {
			for (let childNode of checkBox.parentNode.childNodes) {
				if (childNode.id && childNode.id.includes("urllabel") && childNode.children.length > 0) {
					selectedItems.push(childNode.children[0].href)
					break;
				}
			}
		}
	}

	return selectedItems;
}

function gtfo_Grabber_Copy() {
	var selectedItems = gtfo_Grabber_GetSelectedUrls();

	navigator.clipboard.writeText(selectedItems.join('\r\n'));
}

function gtfo_Grabber_Save() {
	var selectedItems = gtfo_Grabber_GetSelectedUrls();
	if (selectedItems.length > 0) {
		let downloadLink = document.createElement('a');
		downloadLink.href = "data:application/octet-stream," + encodeURIComponent(selectedItems.join('\r\n'));
		downloadLink.download = `urls_${hostName}_${new Date().getTime()}.txt`;
		downloadLink.click();
	}
}

function gtfo_GetCommentsFromData(data) {
	var source = String(data || '');
	var scriptCommentsCleaned = [];
	var scriptCommentSet = new Set();
	var state = 'code';
	var stringReturnState = 'code';
	var templateExpressionDepth = 0;
	var blockCommentStart = 0;
	var lineCommentStart = 0;

	function appendComment(comment) {
		comment = String(comment || '').replace(/\t/g, '').trim();
		if (comment.endsWith(','))
			comment = comment.slice(0, -1);
		if (comment && !scriptCommentSet.has(comment)) {
			scriptCommentSet.add(comment);
			scriptCommentsCleaned.push(comment);
		}
	}

	function isEscaped(index) {
		var slashCount = 0;
		for (let scanIndex = index - 1; scanIndex >= 0 && source[scanIndex] == '\\'; scanIndex--)
			slashCount++;
		return slashCount % 2 == 1;
	}

	for (let index = 0; index < source.length; index++) {
		var character = source[index];
		var nextCharacter = source[index + 1];

		if (state == 'code') {
			if (character == '"' || character == "'") {
				stringReturnState = 'code';
				state = character;
			}
			else if (character == '`')
				state = 'template';
			else if (character == '/' && nextCharacter == '/') {
				lineCommentStart = index;
				state = 'line-comment';
				index++;
			}
			else if (character == '/' && nextCharacter == '*') {
				blockCommentStart = index;
				state = 'block-comment';
				index++;
			}
		}
		else if (state == '"' || state == "'") {
			if (character == state && !isEscaped(index))
				state = stringReturnState;
		}
		else if (state == 'template') {
			if (character == '`' && !isEscaped(index))
				state = 'code';
			else if (character == '$' && nextCharacter == '{' && !isEscaped(index)) {
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
			else if (character == '/' && nextCharacter == '/') {
				lineCommentStart = index;
				state = 'line-comment';
				index++;
			}
			else if (character == '/' && nextCharacter == '*') {
				blockCommentStart = index;
				state = 'block-comment';
				index++;
			}
		}
		else if (state == 'line-comment') {
			if (character == '\n' || character == '\r') {
				appendComment(source.slice(lineCommentStart, index));
				state = templateExpressionDepth > 0 ? 'template-expression' : 'code';
			}
		}
		else if (state == 'block-comment') {
			if (character == '*' && nextCharacter == '/') {
				appendComment(source.slice(blockCommentStart, index + 2));
				state = templateExpressionDepth > 0 ? 'template-expression' : 'code';
				index++;
			}
		}
	}

	if (state == 'line-comment')
		appendComment(source.slice(lineCommentStart));

	return scriptCommentsCleaned;
}

function gtfo_GetCssCommentsFromData(data) {
	var cssComments = Array.from(String(data || '').matchAll(/\/\*[\s\S]*?\*\//g));
	var cssCommentsCleaned = [];
	var cssCommentSet = new Set();

	for (let commentMatch of cssComments) {
		var comment = commentMatch[0].trim();
		if (comment && !cssCommentSet.has(comment)) {
			cssCommentSet.add(comment);
			cssCommentsCleaned.push(comment);
		}
	}

	return cssCommentsCleaned;
}

async function gtfo_GetCommentsDiv() {
	// html
	var htmlComments = [];
	var nodeIterator = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, null);
	var comment;

	var htmlTreeViewHtmlItems = getElement('ul', 'gtfo-comments-treeview-nested', 'gtfo-comments-treeview-nested', null);

	// removal of duplicates
	while (comment = nodeIterator.nextNode()) {
		comment = comment.textContent.trim();
		if (!htmlComments.includes(comment))
			htmlComments.push(comment);
	}

	for (let i = 0; i < htmlComments.length; i++) {
		var htmlTreeViewHtmlItem = getElement('li', 'gtfo-comments-treeview-li', null, null);
		htmlTreeViewHtmlItem.textContent = htmlComments[i];
		htmlTreeViewHtmlItems.appendChild(htmlTreeViewHtmlItem);
	}

	var htmlTreeViewSpan = getElement('span', 'gtfo-comments-treeview-span', 'gtfo-comments-treeview-caret', null);
	htmlTreeViewSpan.textContent = 'HTML';
	htmlTreeViewSpan.onclick = function () {
		this.classList.toggle('gtfo-comments-treeview-caret-side');
		this.parentElement.querySelector('.gtfo-comments-treeview-nested').classList.toggle('gtfo-comments-treeview-active');
	}

	var htmlTreeViewLi = getElement('li', 'gtfo-comments-treeview-li', null, null);
	htmlTreeViewLi.appendChild(htmlTreeViewSpan);
	htmlTreeViewLi.appendChild(htmlTreeViewHtmlItems);

	// js
	var jsComments = [];
	var scripts = document.getElementsByTagName('script');

	var scriptResults = [];
	var scriptCommentsCleaned = [];

	var pageScripts = { file: 'Page', location: null, comments: [] };
	for (let i = 0; i < scripts.length; i++) {
		// slow process, needs to be downloaded..
		if (scripts[i].src) {
			fetch(scripts[i].src).then((response) => {
				if (response.ok) {
					return response.text();
				}
				throw new Error();
			})
				.then((scriptdata) => {
					scriptCommentsCleaned = gtfo_GetCommentsFromData(scriptdata);
				})
				.catch((error) => {
					if (debugging)
						console.log(`Can't load file: ${scripts[i].src}`);
				});
		}
		else {
			scriptCommentsCleaned = gtfo_GetCommentsFromData(scripts[i].textContent);
		}

		if (scriptCommentsCleaned.length > 0) {
			var fileName;
			if (scripts[i].src) {
				fileName = scripts[i].src.split('/');
				fileName = fileName[fileName.length - 1];
				scriptResults.push({ file: fileName, location: scripts[i].src, comments: scriptCommentsCleaned });
			}
			else {
				if (pageScripts.comments.length > 0)
					pageScripts.comments.push.apply(pageScripts.comments, scriptCommentsCleaned);
				else
					pageScripts.comments = scriptCommentsCleaned;
			}
		}
	}

	if (pageScripts.comments.length > 0) {
		scriptResults.unshift(pageScripts);
	}

	var jsNestedFiles = getElement('ul', 'gtfo-comments-treeview-nested', 'gtfo-comments-treeview-nested', null);
	for (let i = 0; i < scriptResults.length; i++) {
		var jsNestedItems = getElement('ul', 'gtfo-comments-treeview-nested', 'gtfo-comments-treeview-nested', null);
		for (let j = 0; j < scriptResults[i].comments.length; j++) {
			var jsNestedItem = getElement('li', 'gtfo-comments-treeview-li', null, null);
			jsNestedItem.textContent = scriptResults[i].comments[j];
			jsNestedItems.appendChild(jsNestedItem);
		}

		var jsTreeViewSpan = getElement('span', 'gtfo-comments-treeview-span', 'gtfo-comments-treeview-caret', null);
		jsTreeViewSpan.onclick = function () {
			this.classList.toggle('gtfo-comments-treeview-caret-side');
			this.parentElement.querySelector('.gtfo-comments-treeview-nested').classList.toggle('gtfo-comments-treeview-active');
		}

		var jsLink = getElement('a', 'gtfo-comments-treeview-url', null, scriptResults[i].file);
		if (scriptResults[i].location)
			jsLink.href = scriptResults[i].location;
		jsTreeViewSpan.appendChild(jsLink);

		var jsTreeViewLi = getElement('li', 'gtfo-comments-treeview-li', null, null);
		jsTreeViewLi.appendChild(jsTreeViewSpan);
		jsTreeViewLi.appendChild(jsNestedItems);
		jsNestedFiles.appendChild(jsTreeViewLi);
	}

	var jsTreeViewSpan = getElement('span', 'gtfo-comments-treeview-span', 'gtfo-comments-treeview-caret', null);
	jsTreeViewSpan.textContent = 'JavaScript';
	jsTreeViewSpan.onclick = function () {
		this.classList.toggle('gtfo-comments-treeview-caret-side');
		this.parentElement.querySelector('.gtfo-comments-treeview-nested').classList.toggle('gtfo-comments-treeview-active');
	}

	var jsTreeViewLi = getElement('li', 'gtfo-comments-treeview-li', null, null);
	jsTreeViewLi.appendChild(jsTreeViewSpan);
	jsTreeViewLi.appendChild(jsNestedFiles);

	// adding all to the treeview
	var commentsTreeView = getElement('ul', 'gtfo-comments-treeview-ul', null, null);
	commentsTreeView.appendChild(htmlTreeViewLi);
	commentsTreeView.appendChild(jsTreeViewLi);

	var commentsTabDiv = getPageDiv('Comments', null, null);
	commentsTabDiv.appendChild(commentsTreeView);

	return commentsTabDiv;
}

function gtfo_GetUrlsDiv() {
	// extract urls from object list to normal list
	const unfilteredLinks = [];
	for (let linkobject of document.links) {
		unfilteredLinks.push(decodeURI(linkobject.href));
	}

	// this removes the duplicates
	const pageLinks = [...new Set(unfilteredLinks)];
	pageLinks.sort();

	var urlsTabDiv = getPageDiv('Urls', 'height: 100%; width: 100%; overflow: hidden; overflow-y:', null);

	// toolbar
	var toolBarDiv = getElement('div', 'gtfo-urls-toolbar', null, null);

	var toolbarSaveButton = getElement('button', 'gtfo-topbar-button-Save', null, 'Save');
	toolbarSaveButton.onclick = function () { gtfo_Grabber_Save(); }
	toolBarDiv.appendChild(toolbarSaveButton);

	var toolbarCopyButton = getElement('button', 'gtfo-topbar-button-Copy', null, 'Copy');
	toolbarCopyButton.onclick = function () { gtfo_Grabber_Copy(); }
	toolBarDiv.appendChild(toolbarCopyButton);

	var selectinput = getElement('input', `gtfo-urls-selectall`, null, null);
	selectinput.type = 'checkbox';
	selectinput.onclick = function () { gtfo_Grabber_SelectAll(this); }
	toolBarDiv.appendChild(selectinput);

	var selectallLabel = getElement('label', `gtfo-selectall-label`, 'gtfo-selectall-label', 'Select all');
	toolBarDiv.appendChild(selectallLabel);

	urlsTabDiv.appendChild(toolBarDiv);

	var urlColorClass;
	const totalDigits = pageLinks.length.toString().length;

	for (let i = 0; i < pageLinks.length; i++) {
		urlColorClass = ((i + 1) % 2) ? 'gtfo-grabber-url-even' : 'gtfo-grabber-url-odd';

		var elemDiv = getElement('div', `gtfo-urldiv-${i + 1}`, urlColorClass, null);

		var input = getElement('input', `gtfo-input-${i + 1}`, 'gtfo-tab-input', null);
		input.type = 'checkbox';
		elemDiv.appendChild(input);

		var urlLabel = getElement('label', `gtfo-urllabel-${i + 1}`, 'gtfo-url-label', null);
		urlLabel.onclick = function () { toggleInput('gtfo-input-*', this); }

		var zeroString = '0'.repeat(totalDigits - (i + 1).toString().length);
		var urlLink = getElement('a', 'gtfo-grabber-url', null, `${zeroString}${(i + 1)}: ${pageLinks[i]}`);
		urlLink.href = pageLinks[i];
		urlLabel.appendChild(urlLink);

		elemDiv.appendChild(urlLabel);
		urlsTabDiv.appendChild(elemDiv);
	}

	// urlspage
	var urlsDiv = getElement('div', 'gtfo-url-div', null, null);
	urlsDiv.appendChild(urlsTabDiv);
	return urlsDiv;
}

function getBase64Image(img) {
	var newImage = null;
	if (img.width > 0) {
		var canvas = document.createElement("canvas");

		/* this belongs to the attempt to fix images original source size not the parametered one.
		
		if (img.naturalWidth && img.naturalHeight ) {
			if(img.src.includes("?")) {
				var newSrc = img.src.split("?")[0];
				img.currentSrc = newSrc;
				img.src = newSrc;
				console.log("splitted");
			}
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
		} 
		else*/ {
			canvas.width = img.width;
			canvas.height = img.height;
		}

		var ctx = canvas.getContext("2d");
		try {
			ctx.drawImage(img, 0, 0);

			var dataURL = canvas.toDataURL("image/png");
			var dataString = dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
			var sizeInKiloBytes = (4 * Math.ceil((dataString.length / 3)) * 0.5624896334383812) / 1024;
			sizeInKiloBytes = Number(Math.round(sizeInKiloBytes + 'e2') + 'e-2');
			newImage = { data: dataURL, width: canvas.width, height: canvas.height, size: sizeInKiloBytes };
		}
		catch (error) {
			if (debugging)
				console.log(`Can't read image data: ${img.currentSrc || img.src}`);
		}
	}
	return newImage;
}

function gtfo_Images_Save(image, fileName) {
	var link = document.createElement("a");

	document.body.appendChild(link); // for Firefox

	link.setAttribute("href", image);
	link.setAttribute("download", fileName);
	link.click();
	link.remove();
}

async function gtfo_Images_Copy(base64Data) {
	const base64 = await fetch(base64Data);
	//const base64Response = await fetch(`data:image/jpg;base64,${base64Data}`);
	const blob = await base64.blob();

	browser.clipboard.setImageData(blob, 'png');
	//await navigator.clipboard.write([new ClipboardItem({ 'img/png': blob })]);
}

function gtfo_Images_Modal(source, show) {
	var modal = document.getElementById('gtfo-image-modal');
	if (show) {
		if (source.target && source.target.src) {
			var modalImage = document.getElementById('gtfo-image-modal-image');
			modalImage.src = source.target.src;

			modal.style.display = 'flex';
		}
	}
	else {
		var splittedTarget = source.target.id.split("-");
		if (splittedTarget.length < 4 || source.target.id.includes('close'))
			modal.style.display = 'none';
	}
}

function gtfo_Images_ToggleActive(input) {
	// deselect
	var image = input.firstChild.firstChild.src;
	if (input.id.includes('selected')) {
		input.id = input.id.replace("-selected", "");
		input.children[0].id = input.children[0].id.replace("-selected", "");

		for (var i = selectedImages.length; i > - 1; i--) {
			if (selectedImages[i] == image) {
				selectedImages.splice(i, 1);
				// we break here, we don't want to delete duplicates
				break;
			}
		}
	}
	// select
	else {
		input.id = `${input.id}-selected`;
		input.children[0].id = `${input.children[0].id}-selected`;
		selectedImages.push(image);
	}
}

function gtfo_IsPresentInFilteredImages(item, list) {
	if (!item)
		return true;

	for (var i = 0; i < list.length; i++) {
		if (item.data == list[i].data) {
			return true;
		}
	}
	return false;
}

function gtfo_IsURL(str) {
	return /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/.test(str);
}

function gtfo_GetHtmlComments() {
	var comments = [];
	var commentSet = new Set();
	var nodeIterator = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, null);
	var comment;

	while (comment = nodeIterator.nextNode()) {
		var text = comment.textContent.trim();
		if (text && !commentSet.has(text)) {
			commentSet.add(text);
			comments.push(text);
		}
	}

	return comments;
}

function gtfo_GetInlineScriptComments() {
	var comments = [];
	var commentSet = new Set();
	var scripts = document.getElementsByTagName('script');

	for (let script of scripts) {
		if (!script.src) {
			var scriptComments = gtfo_GetCommentsFromData(script.textContent);
			for (let scriptComment of scriptComments) {
				if (!commentSet.has(scriptComment)) {
					commentSet.add(scriptComment);
					comments.push(scriptComment);
				}
			}
		}
	}

	return comments;
}

function gtfo_GetUrlList() {
	var urls = new Set();

	for (let link of document.links) {
		if (link.href)
			urls.add(decodeURI(link.href));
	}

	urls = Array.from(urls);
	urls.sort();
	return urls;
}

function gtfo_GetImageList() {
	var images = [];
	var imageUrls = new Set();

	function getImageTypeFromUrl(url) {
		var cleanUrl = String(url || '').split('?')[0].split('#')[0];
		var match = cleanUrl.match(/\.([a-z0-9]{2,5})$/i);
		return match ? match[1].toLowerCase() : '';
	}

	function addImage(image) {
		if (!image.url || imageUrls.has(image.url))
			return;

		imageUrls.add(image.url);
		images.push(image);
	}

	for (let image of document.images) {
		var source = image.currentSrc || image.src;
		if (source)
			addImage({
				url: source,
				name: image.getAttribute('download') || image.getAttribute('alt') || image.getAttribute('title') || '',
				width: image.naturalWidth || image.width || null,
				height: image.naturalHeight || image.height || null,
				type: getImageTypeFromUrl(source)
			});
	}

	var backgroundImages = document.querySelectorAll('[style*="background"]');
	for (let element of backgroundImages) {
		var backgroundImage = element.style.backgroundImage;
		var match = backgroundImage && backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
		if (match && match[1]) {
			var backgroundUrl = new URL(match[1], document.baseURI).href;
			addImage({
				url: backgroundUrl,
				name: '',
				width: null,
				height: null,
				type: getImageTypeFromUrl(backgroundUrl)
			});
		}
	}

	return images;
}

async function gtfo_GetTextFromUrl(url) {
	try {
		var response = await fetch(url);
		if (response.ok)
			return await response.text();
	}
	catch (error) {
		if (debugging)
			console.log(`Can't load source: ${url}`);
	}

	if (browser.runtime && browser.runtime.sendMessage) {
		try {
			var backgroundResponse = await browser.runtime.sendMessage({
				type: 'gtfo_fetch_text',
				url: url
			});

			if (backgroundResponse && backgroundResponse.ok)
				return backgroundResponse.text;
		}
		catch (error) {
			if (debugging)
				console.log(`Can't load source through background: ${url}`);
		}
	}

	return null;
}

async function gtfo_GetScriptList() {
	var pageScriptSources = [];
	var pageScriptComments = [];
	var pageScriptCommentSet = new Set();
	var externalScriptPromises = [];

	for (let script of document.scripts) {
		if (script.src) {
			externalScriptPromises.push((async () => {
				var source = await gtfo_GetTextFromUrl(script.src);
				return {
					url: script.src,
					source: source || `Unable to load source: ${script.src}`,
					comments: source ? gtfo_GetCommentsFromData(source) : []
				};
			})());
		}
		else if (script.textContent) {
			pageScriptSources.push(script.textContent);
			for (let comment of gtfo_GetCommentsFromData(script.textContent)) {
				if (!pageScriptCommentSet.has(comment)) {
					pageScriptCommentSet.add(comment);
					pageScriptComments.push(comment);
				}
			}
		}
	}

	var scripts = await Promise.all(externalScriptPromises);
	if (pageScriptSources.length > 0) {
		scripts.unshift({
			url: 'Page',
			source: pageScriptSources.join('\n\n'),
			comments: pageScriptComments
		});
	}

	return scripts;
}

async function gtfo_GetCssList() {
	var stylesheetPromises = [];

	for (let stylesheet of document.styleSheets) {
		if (stylesheet.href) {
			stylesheetPromises.push((async () => {
				var source = await gtfo_GetTextFromUrl(stylesheet.href);
				return {
					url: stylesheet.href,
					source: source || `Unable to load source: ${stylesheet.href}`,
					comments: source ? gtfo_GetCssCommentsFromData(source) : []
				};
			})());
		}
	}

	return Promise.all(stylesheetPromises);
}

function gtfo_GetFullDocumentSource() {
	return Array.from(document.childNodes).map((node) => {
		if (node.nodeType == Node.DOCUMENT_TYPE_NODE) {
			var publicId = node.publicId ? ` PUBLIC "${node.publicId}"` : '';
			var systemId = node.systemId ? `${node.publicId ? '' : ' SYSTEM'} "${node.systemId}"` : '';
			return `<!DOCTYPE ${node.name}${publicId}${systemId}>`;
		}

		if (node.nodeType == Node.ELEMENT_NODE)
			return node.outerHTML;

		return new XMLSerializer().serializeToString(node);
	}).join('\n');
}

async function gtfo_GetEmbeddedData() {
	var htmlComments = gtfo_GetHtmlComments();
	var scriptsPromise = gtfo_GetScriptList();
	var stylesheetsPromise = gtfo_GetCssList();
	var pageSource = gtfo_GetFullDocumentSource();
	var urls = gtfo_GetUrlList();
	var images = gtfo_GetImageList();
	var scripts = await scriptsPromise;
	var stylesheets = await stylesheetsPromise;

	return {
		pageUrl: window.location.href,
		title: document.title || window.location.hostname || 'Page',
		host: window.location.hostname || window.location.host || 'page',
		url: window.location.href,
		pageHtml: pageSource,
		html: {
			name: window.location.hostname || window.location.host || 'page',
			source: pageSource,
			comments: htmlComments
		},
		js: scripts,
		css: stylesheets,
		urls: urls,
		comments: {
			html: htmlComments,
			javascript: scripts.flatMap((script) => script.comments || [])
		},
		images: images
	};
}

async function gtfo_GetImagesDiv() {
	var images = document.getElementsByTagName("img");

	var imageNumber = 0;
	var imagesPerLine = 5;

	var imagesDiv = getPageDiv('Images', null, null);
	var imagesLineDiv;
	var imageContainer, imagePicture, imageInfo;
	var imageButtonBar, imageCopyButton, imageSaveButton;
	var imageDisplayInfo, imageType, imageSize, imageResolution;
	var imageDisplay, backgroundImageProperties, maxImageSize;
	var filteredImages = [];

	// get all background images
	var backgroundImages = document.querySelectorAll('[style*="background"]');
	for (var i = 0; i < backgroundImages.length; i++) {
		if (backgroundImages[i].style && backgroundImages[i].style.backgroundImage) {
			var backgroundImage = backgroundImages[i].style.backgroundImage;
			if (backgroundImage && backgroundImage.includes("url")) {
				backgroundImageProperties = backgroundImage.split("\"");

				if (backgroundImageProperties.length > 0) {
					if (gtfo_IsURL(backgroundImageProperties[1])) {
						var newImage = new Image;
						newImage.src = backgroundImageProperties[1];

						imageInfo = getBase64Image(newImage);
						if (!gtfo_IsPresentInFilteredImages(imageInfo, filteredImages)) {
							filteredImages.push(imageInfo);
						}
					}
				}
			}
		}
	}

	// filter out the duplicates
	for (var i = 0; i < images.length; i++) {
		// CONTINUE: fix images if they have params...
		/*if(images[i].src.includes("?")) {
			var newImage = new Image;
			newImage.src = images[i].src.split("?")[0];

			imageInfo = getBase64Image(newImage);
		}
		else*/ {
			imageInfo = getBase64Image(images[i]);
		}
		if (!gtfo_IsPresentInFilteredImages(imageInfo, filteredImages)) {
			filteredImages.push(imageInfo);
		}
	}

	for (var i = 0; i < filteredImages.length; i++) {
		imageNumber += 1;

		if (imageNumber == 1) {
			imagesLineDiv = getElement('div', 'gtfo-images-line', null, null);
		}

		// image data
		imageInfo = filteredImages[i];

		// image picture
		imagePicture = getElement('img', 'gtfo-image-picture', null, null);
		imagePicture.src = imageInfo.data;

		maxImageSize = 250;
		// only when the image size exceeds the maxImageSize we want to resize because of the quality
		if (imageInfo.height > maxImageSize || imageInfo.width > maxImageSize) {
			imagePicture.height = imageInfo.height > imageInfo.width ? maxImageSize : maxImageSize / (imageInfo.width / imageInfo.height);
			imagePicture.width = imageInfo.width > imageInfo.height ? maxImageSize : maxImageSize / (imageInfo.height / imageInfo.width);
		}
		else {
			imagePicture.height = imageInfo.height;
			imagePicture.width = imageInfo.width;
		}
		imagePicture.alt = `gtfo_image_${i}`;

		imageDisplay = getElement('div', 'gtfo-image-display', null, null);
		imageDisplay.onclick = function (e) { gtfo_Images_Modal(e, true); }
		imageDisplay.appendChild(imagePicture);

		// imageinfo
		imageType = getElement('div', 'gtfo-image-info-text', null, 'Type: PNG');
		imageSize = getElement('div', 'gtfo-image-info-text', null, `Size: ${imageInfo.size}KB`);

		// 		buttonbar
		imageCopyButton = getElement('button', 'gtfo-image-button-copy', null, 'Copy');
		imageCopyButton.onclick = function () { gtfo_Images_Copy(this.parentNode.parentNode.parentNode.parentNode.children[0].children[0].src); }
		imageSaveButton = getElement('button', 'gtfo-image-button-save', null, 'Save');
		imageSaveButton.onclick = function (e) { gtfo_Images_Save(this.parentNode.parentNode.parentNode.parentNode.children[0].children[0].src, `gtfo_Image`); e.stopPropagation(); }

		imageButtonBar = getElement('div', 'gtfo-image-buttonbar', null, null);
		imageButtonBar.appendChild(imageSaveButton);
		// copy function doesn't work in firefox, need to find another method..
		//imageButtonBar.appendChild(imageCopyButton);

		imageResolution = getElement('div', 'gtfo-image-info-text', null, `Res: ${imageInfo.width} x ${imageInfo.height}`);
		imageResolution.appendChild(imageButtonBar);

		imageDisplayInfo = getElement('div', 'gtfo-image-info', null, null);
		imageDisplayInfo.onclick = function () { gtfo_Images_ToggleActive(this.parentNode); }
		imageDisplayInfo.appendChild(imageType);
		imageDisplayInfo.appendChild(imageSize);
		imageDisplayInfo.appendChild(imageResolution);

		// image container
		imageContainer = getElement('div', 'gtfo-image-container', null, null);
		imageContainer.appendChild(imageDisplay);
		imageContainer.appendChild(imageDisplayInfo);

		imagesLineDiv.appendChild(imageContainer);

		if (imageNumber == imagesPerLine || i == filteredImages.length - 1) {
			imageNumber = 0;
			imagesDiv.appendChild(imagesLineDiv);
		}
	}

	var imageModalClose = getElement('span', 'gtfo-image-modal-close', null, 'X');
	var imadeModalCloseDiv = getElement('div', 'gtfo-image-modal-close-div', null, null);
	imadeModalCloseDiv.appendChild(imageModalClose);

	var imageModalImage = getElement('img', 'gtfo-image-modal-image', null, null);
	var imageModalContent = getElement('div', 'gtfo-image-modal-content', null, null);
	imageModalContent.appendChild(imageModalImage);
	imageModalContent.appendChild(imadeModalCloseDiv);
	var imageModal = getElement('div', 'gtfo-image-modal', null, null);
	imageModal.onclick = function (e) { gtfo_Images_Modal(e, false); }
	imageModal.appendChild(imageModalContent);

	imagesDiv.appendChild(imageModal);

	var imagesOuterDiv = getElement('div', 'gtfo-images-div', null, null);
	imagesOuterDiv.appendChild(imagesDiv);

	return imagesOuterDiv;
}

async function gtfo_Grabber() {
	if (!document.getElementById(randomString)) {
		originalBackgroundColor = window.getComputedStyle(document.body, null).backgroundColor;
		originalBackgroundImage = window.getComputedStyle(document.body, null).backgroundImage;

		var newBody = getElement('body', randomString, null, null);

		// topbar
		var topBarDiv = getElement('div', 'gtfo-grabber-topbar', null, null);
		topBarDiv.appendChild(getPageButton('Page', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Urls', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Comments', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Images', true, 'gtfo-tab-button'));
		newBody.appendChild(topBarDiv);

		// add urls div
		try {
			newBody.appendChild(gtfo_GetUrlsDiv());
		}
		catch (error) {
			newBody.appendChild(gtfo_GetErrorDiv('Urls', error));
		}

		// add comments div
		try {
			newBody.appendChild(await gtfo_GetCommentsDiv());
		}
		catch (error) {
			newBody.appendChild(gtfo_GetErrorDiv('Comments', error));
		}

		// add images div
		try {
			newBody.appendChild(await gtfo_GetImagesDiv());
		}
		catch (error) {
			newBody.appendChild(gtfo_GetErrorDiv('Images', error));
		}

		// add old body
		var pageTab = getPageDiv('Page', null, null);
		while (document.body.firstChild)
			pageTab.appendChild(document.body.firstChild);
		newBody.appendChild(pageTab);
		document.body = newBody;
	}
	else {
		alert("Grabber has already been executed!");
	}

	switchTab('Urls');
}

function onCreated(tab) {
	if (debugging)
		console.log(`Created new tab: ${tab.id}`)
}

function onError(error) {
	if (debugging)
		console.log(`Error: ${error}`);
}

function gtfo_RightClick() {
	const injectionCommand = e => e.stopPropagation();
	const cleanup = () => {
		document.removeEventListener('contextmenu', injectionCommand, true);
		document.removeEventListener('copy', injectionCommand, true);
		document.removeEventListener('dragstart', injectionCommand, true);
		document.removeEventListener('mousedown', injectionCommand, true);
		document.removeEventListener('paste', injectionCommand, true);
		document.removeEventListener('selectstart', injectionCommand, true);
	};

	// adding evenlisteners to stop the events
	document.addEventListener('contextmenu', injectionCommand, true);
	document.addEventListener('copy', injectionCommand, true);
	document.addEventListener('dragstart', injectionCommand, true);
	document.addEventListener('mousedown', injectionCommand, true);
	document.addEventListener('paste', injectionCommand, true);
	document.addEventListener('selectstart', injectionCommand, true);

	// removing the event listeners when the target page exposes the old cleanup hook
	if (window.pointers && window.pointers.run && typeof window.pointers.run.add == 'function')
		window.pointers.run.add(cleanup);
}

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
	if (!request)
		return Promise.resolve(true);

	switch (request.type) {
		case 'gtfo_ping':
			break;
		case 'gtfo_unhide':
			gtfo_Unhide();
			break;
		case 'gtfo_grabber':
			var embeddedData = await gtfo_GetEmbeddedData();
			return Promise.resolve({
				data: embeddedData
			});
		case 'gtfo_rightclick':
			gtfo_RightClick();
			break;
	}

	return Promise.resolve(true);
});
