var debugging = false;
var hostName = window.location.host.replace(".","_");

const randomize = (n, r = '') => {
	while (n--) r += String.fromCharCode((r = Math.random() * 62 | 0, r += r > 9 ? (r < 36 ? 55 : 61) : 48));
	return r;
};

console.log(`hostName: ${hostName}`);

function handleMutations(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.target.id == 'overlay')
		{
			if (window.location.hostname === 'www.nzbserver.com') {
				var elements = document.getElementsByClassName('nzbDownloadButton');
				var elementsArray = Array.from(elements);
				elementsArray.forEach(function(element) {
					if (!element.hasAttribute('touched'))
					{
						if (!element.hasAttribute('GTFO'))
						{
							element.setAttribute('GTFO', true);
							var href = element.getAttribute('href');
							element.setAttribute('href', href.replace('nzbserver', 'clubnzb'));
						}
					}
				});
			}
		}
	});
  }
  
// Create a MutationObserver
var observer = new MutationObserver(handleMutations);

// Configure the observer to watch for changes in the entire document
var observerConfig = { childList: true, subtree: true };
observer.observe(document, observerConfig);

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
			for (childNode of checkBox.parentNode.childNodes) {
				if (childNode.id.includes("urllabel") && childNode.children.length > 0) {
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
		document.removeelem
	}
}

function gtfo_GetCommentsFromData(data) {
	const ignoreCharacters = ['\"', '(', '\'', '"'];
	const regexp = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm;
	var scriptComments = Array.from(data.matchAll(regexp));
	var scriptCommentsCleaned = [];
	var firstChar, lastChar, scriptComment;
	for (let j = 0; j < scriptComments.length; j++) {
		scriptComment = scriptComments[j].toString();
		firstChar = scriptComment.charAt(0);

		if (!ignoreCharacters.includes(firstChar)) {
			scriptComment = scriptComment.replace(/\t/g, '').trim();
			lastChar = scriptComment.charAt(scriptComment.length - 1);

			if (lastChar == ',')
				scriptComment = scriptComment.slice(0, -1);
			// no more duplications
			if (!scriptCommentsCleaned.includes(scriptComment))
				scriptCommentsCleaned.push(scriptComment);
		}
	}

	return scriptCommentsCleaned;
}

function gtfo_GetCssCommentsFromData(data) {
	var cssComments = Array.from(String(data || '').matchAll(/\/\*[\s\S]*?\*\//g));
	var cssCommentsCleaned = [];

	for (let commentMatch of cssComments) {
		var comment = commentMatch[0].trim();
		if (comment && !cssCommentsCleaned.includes(comment))
			cssCommentsCleaned.push(comment);
	}

	return cssCommentsCleaned;
}

async function gtfo_GetCommentsDiv() {
	// html
	htmlComments = [];
	nodeIterator = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, null);

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
	jsComments = [];
	var scripts = document.getElementsByTagName('script');

	var scriptResults = [];
	var scriptCommentsCleaned = [];

	pageScripts = { file: 'Page', location: null, comments: [] };
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
	var nodeIterator = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, null);
	var comment;

	while (comment = nodeIterator.nextNode()) {
		var text = comment.textContent.trim();
		if (text && !comments.includes(text))
			comments.push(text);
	}

	return comments;
}

function gtfo_GetInlineScriptComments() {
	var comments = [];
	var scripts = document.getElementsByTagName('script');

	for (let script of scripts) {
		if (!script.src) {
			var scriptComments = gtfo_GetCommentsFromData(script.textContent);
			for (let scriptComment of scriptComments) {
				if (!comments.includes(scriptComment))
					comments.push(scriptComment);
			}
		}
	}

	return comments;
}

function gtfo_GetUrlList() {
	var urls = [];

	for (let link of document.links) {
		if (link.href)
			urls.push(decodeURI(link.href));
	}

	urls = [...new Set(urls)];
	urls.sort();
	return urls;
}

function gtfo_GetImageList() {
	var images = [];

	for (let image of document.images) {
		var source = image.currentSrc || image.src;
		if (source && !images.includes(source))
			images.push(source);
	}

	var backgroundImages = document.querySelectorAll('[style*="background"]');
	for (let element of backgroundImages) {
		var backgroundImage = element.style.backgroundImage;
		var match = backgroundImage && backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
		if (match && match[1] && !images.includes(match[1]))
			images.push(match[1]);
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

	return null;
}

async function gtfo_GetScriptList() {
	var scripts = [];

	for (let script of document.getElementsByTagName('script')) {
		if (script.src) {
			var source = await gtfo_GetTextFromUrl(script.src);
			scripts.push({
				url: script.src,
				source: source || `Unable to load source: ${script.src}`,
				comments: source ? gtfo_GetCommentsFromData(source) : []
			});
		}
		else {
			scripts.push({
				url: 'Page',
				source: script.textContent,
				comments: gtfo_GetCommentsFromData(script.textContent)
			});
		}
	}

	return scripts;
}

async function gtfo_GetCssList() {
	var stylesheets = [];

	for (let stylesheet of document.styleSheets) {
		if (stylesheet.href) {
			var source = await gtfo_GetTextFromUrl(stylesheet.href);
			stylesheets.push({
				url: stylesheet.href,
				source: source || `Unable to load source: ${stylesheet.href}`,
				comments: source ? gtfo_GetCssCommentsFromData(source) : []
			});
		}
	}

	return stylesheets;
}

function gtfo_EscapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
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
	var scripts = await gtfo_GetScriptList();
	var stylesheets = await gtfo_GetCssList();
	var pageSource = gtfo_GetFullDocumentSource();

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
		urls: gtfo_GetUrlList(),
		comments: {
			html: htmlComments,
			javascript: scripts.flatMap((script) => script.comments || [])
		},
		images: gtfo_GetImageList()
	};
}

function gtfo_GetReportHtml(data) {
	var reportTitle = `GTFO: ${data.host || data.title}`;
	var embeddedData = gtfo_EscapeHtml(JSON.stringify(data));

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<title>${gtfo_EscapeHtml(reportTitle)}</title>
	<style>
		body { margin: 0; background: #313131; color: white; font-family: Consolas, monospace; }
		#gtfo-grabber-topbar { height: 30px; background: #1a1a1a; display: flex; align-items: stretch; }
		.gtfo-tab-button, .gtfo-tool-button { cursor: pointer; background: transparent; border: 1px solid currentColor; color: white; font: 12px Consolas, monospace; padding: 3px 18px; margin-right: 1px; }
		.gtfo-tab-button:hover, .gtfo-tool-button:hover, .gtfo-tab-button-active { color: red; border-color: red; }
		#gtfo-report-meta { padding: 8px 10px; font-size: 12px; background: #262626; border-bottom: 1px solid #1a1a1a; }
		#gtfo-report-meta a { color: white; }
		.tabcontent { display: none; }
		.tabcontent-active { display: block; }
		#Urls { height: calc(100vh - 68px); overflow: auto; }
		#gtfo-urls-toolbar { height: 25px; background: #313131; display: flex; align-items: center; gap: 8px; padding: 0 6px; position: sticky; top: 0; }
		.gtfo-url-row { display: flex; align-items: center; min-height: 18px; font-size: 12px; }
		.gtfo-url-row:nth-child(odd) { background: #313131; }
		.gtfo-url-row:nth-child(even) { background: #414141; }
		.gtfo-url-row input { margin: 0 6px; width: 15px; height: 15px; accent-color: #1a1a1a; }
		.gtfo-url-row a { color: white; text-decoration: none; overflow-wrap: anywhere; }
		.gtfo-url-row a:hover { color: red; }
		#Page iframe { width: 100%; height: calc(100vh - 68px); border: 0; background: white; }
		#Comments, #Images { padding: 10px; }
		.gtfo-comment-group { margin-bottom: 18px; }
		.gtfo-comment-group h2 { font-size: 14px; margin: 0 0 8px; }
		.gtfo-comment-group li { margin-bottom: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
		.gtfo-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
		.gtfo-image-card { border: 1px solid #555; background: #262626; padding: 8px; }
		.gtfo-image-card img { display: block; max-width: 100%; max-height: 180px; margin: 0 auto 8px; object-fit: contain; }
		.gtfo-image-card a { color: white; font-size: 12px; overflow-wrap: anywhere; }
		#gtfo_embedded_data { display: none; }
	</style>
</head>
<body>
	<textarea id="gtfo_embedded_data">${embeddedData}</textarea>
	<div id="gtfo-grabber-topbar">
		<button class="gtfo-tab-button" data-tab="Page">Page</button>
		<button class="gtfo-tab-button" data-tab="Urls">Urls</button>
		<button class="gtfo-tab-button" data-tab="Comments">Comments</button>
		<button class="gtfo-tab-button" data-tab="Images">Images</button>
	</div>
	<div id="gtfo-report-meta"></div>
	<div id="Page" class="tabcontent"></div>
	<div id="Urls" class="tabcontent"></div>
	<div id="Comments" class="tabcontent"></div>
	<div id="Images" class="tabcontent"></div>
	<script>
		const data = JSON.parse(document.getElementById('gtfo_embedded_data').value);
		document.title = 'GTFO: ' + (data.host || data.title || 'Page');

		function escapeHtml(value) {
			return String(value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}

		function switchTab(tabName) {
			document.querySelectorAll('.tabcontent').forEach((tab) => {
				tab.classList.toggle('tabcontent-active', tab.id === tabName);
			});
			document.querySelectorAll('.gtfo-tab-button').forEach((button) => {
				button.classList.toggle('gtfo-tab-button-active', button.dataset.tab === tabName);
			});
		}

		function selectedUrls() {
			return Array.from(document.querySelectorAll('.gtfo-url-input:checked')).map((input) => input.value);
		}

		function clearElement(element) {
			element.replaceChildren();
		}

		function appendReportMeta(container, title, url) {
			clearElement(container);

			const strong = document.createElement('strong');
			strong.textContent = title || '';

			const link = document.createElement('a');
			link.href = url || '#';
			link.textContent = url || '';

			container.appendChild(strong);
			container.append(' - ');
			container.appendChild(link);
		}

		function createToolButton(id, text) {
			const button = document.createElement('button');
			button.className = 'gtfo-tool-button';
			button.id = id;
			button.type = 'button';
			button.textContent = text;
			return button;
		}

		function createUrlToolbar() {
			const toolbar = document.createElement('div');
			toolbar.id = 'gtfo-urls-toolbar';

			toolbar.appendChild(createToolButton('gtfo-copy-urls', 'Copy'));
			toolbar.appendChild(createToolButton('gtfo-save-urls', 'Save'));

			const label = document.createElement('label');
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = 'gtfo-select-all';
			label.appendChild(checkbox);
			label.append(' Select all');

			toolbar.appendChild(label);
			return toolbar;
		}

		function createUrlRow(url, index, total) {
			const row = document.createElement('div');
			row.className = 'gtfo-url-row';

			const input = document.createElement('input');
			input.className = 'gtfo-url-input';
			input.type = 'checkbox';
			input.value = url;

			const link = document.createElement('a');
			link.href = url;
			link.textContent = String(index + 1).padStart(String(total).length, '0') + ': ' + url;

			row.appendChild(input);
			row.appendChild(link);
			return row;
		}

		function appendImageCard(parent, image) {
			const card = document.createElement('div');
			card.className = 'gtfo-image-card';

			const img = document.createElement('img');
			img.src = image;
			img.alt = '';

			const link = document.createElement('a');
			link.href = image;
			link.textContent = image;

			card.appendChild(img);
			card.appendChild(link);
			parent.appendChild(card);
		}

		function buildPage() {
			appendReportMeta(document.getElementById('gtfo-report-meta'), data.title || data.host, data.url);

			const page = document.getElementById('Page');
			const iframe = document.createElement('iframe');
			iframe.setAttribute('sandbox', '');
			iframe.srcdoc = data.pageHtml;
			page.appendChild(iframe);
		}

		function buildUrls() {
			const urls = document.getElementById('Urls');
			urls.appendChild(createUrlToolbar());

			data.urls.forEach((url, index) => {
				urls.appendChild(createUrlRow(url, index, data.urls.length));
			});

			document.getElementById('gtfo-select-all').addEventListener('change', (event) => {
				document.querySelectorAll('.gtfo-url-input').forEach((input) => input.checked = event.target.checked);
			});
			document.getElementById('gtfo-copy-urls').addEventListener('click', () => navigator.clipboard.writeText(selectedUrls().join('\\r\\n')));
			document.getElementById('gtfo-save-urls').addEventListener('click', () => {
				const link = document.createElement('a');
				link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(selectedUrls().join('\\r\\n'));
				link.download = 'urls_' + (data.host || 'page').replace(/[^a-z0-9_-]/gi, '_') + '_' + Date.now() + '.txt';
				link.click();
			});
		}

		function buildComments() {
			const comments = document.getElementById('Comments');
			const groups = [
				{ title: 'HTML', items: data.comments.html },
				{ title: 'JavaScript', items: data.comments.javascript }
			];

			groups.forEach((group) => {
				const section = document.createElement('section');
				section.className = 'gtfo-comment-group';

				const heading = document.createElement('h2');
				heading.textContent = group.title;
				section.appendChild(heading);

				const list = document.createElement('ul');
				group.items.forEach((item) => {
					const li = document.createElement('li');
					li.textContent = item;
					list.appendChild(li);
				});
				section.appendChild(list);
				comments.appendChild(section);
			});
		}

		function buildImages() {
			const images = document.getElementById('Images');
			const grid = document.createElement('div');
			grid.className = 'gtfo-image-grid';

			data.images.forEach((image) => {
				appendImageCard(grid, image);
			});

			images.appendChild(grid);
		}

		document.querySelectorAll('.gtfo-tab-button').forEach((button) => {
			button.addEventListener('click', () => switchTab(button.dataset.tab));
		});

		buildPage();
		buildUrls();
		buildComments();
		buildImages();
		switchTab('Urls');
	</script>
</body>
</html>`;
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

	// adding evenlisteners to stop the events
	document.addEventListener('contextmenu', injectionCommand, true);
	document.addEventListener('copy', injectionCommand, true);
	document.addEventListener('dragstart', injectionCommand, true);
	document.addEventListener('mousedown', injectionCommand, true);
	document.addEventListener('paste', injectionCommand, true);
	document.addEventListener('selectstart', injectionCommand, true);

	// removing the event listeners
	window.pointers.run.add(() => {
		document.removeEventListener('contextmenu', injectionCommand, true);
		document.removeEventListener('copy', injectionCommand, true);
		document.removeEventListener('dragstart', injectionCommand, true);
		document.removeEventListener('mousedown', injectionCommand, true);
		document.removeEventListener('paste', injectionCommand, true);
		document.removeEventListener('selectstart', injectionCommand, true);
	});
}

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
	switch (request.type) {
		case 'gtfo_ping':
			break;
		case 'gtfo_unhide':
			gtfo_Unhide();
			break;
		case 'gtfo_grabber':
			var embeddedData = await gtfo_GetEmbeddedData();
			return Promise.resolve({
				data: embeddedData,
				html: gtfo_GetReportHtml(embeddedData)
			});
		case 'gtfo_rightclick':
			gtfo_RightClick();
			break;
	}

	return Promise.resolve(true);
});
