const randomize = (n, r = '') => {
	while (n--) r += String.fromCharCode((r = Math.random() * 62 | 0, r += r > 9 ? (r < 36 ? 55 : 61) : 48));
	return r;
};

// set to a fixed string for now because of CSS styling
var randomString = 'GTFO-BODY';//randomize(Math.floor(Math.random() * (8 - 2 + 1) + 2));
var originalBackgroundColor;

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

	document.body.style.backgroundColor = (tabName == 'Page') ? originalBackgroundColor : '#313131';

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
		returnElmnt.classList = classlist;
	if (textcontent)
		returnElmnt.textContent = textcontent;

	return returnElmnt;
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
	if (innerhtml)
		pageDiv.innerHTML = innerhtml;

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

	let downloadLink = document.createElement('a');
	downloadLink.href = "data:application/octet-stream," + encodeURIComponent(selectedItems.join('\r\n'));
	downloadLink.download = `urls_${new Date().getTime()}.txt`;
	downloadLink.click();
	document.removeelem
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
	var response, scriptData;
	var scriptCommentsCleaned = [];

	pageScripts = { file: 'Page', location: null, comments: []};
	for (let i = 0; i < scripts.length; i++) {
		// slow process, needs to be downloaded..
		if (scripts[i].src) {
			response = await fetch(scripts[i].src);
			scriptData = await response.text();
			scriptCommentsCleaned = gtfo_GetCommentsFromData(scriptData);
		}
		else {
			scriptCommentsCleaned = gtfo_GetCommentsFromData(scripts[i].textContent);
		}

		if (scriptCommentsCleaned.length > 0) {
			var fileName;
			var location;
			if (scripts[i].src) {
				fileName = scripts[i].src.split('/');
				fileName = fileName[fileName.length - 1];
				location = scripts[i].src;
				scriptResults.push({ file: fileName, location: scripts[i].src, comments: scriptCommentsCleaned });
			}
			else {
				if(pageScripts.comments.length > 0)
					pageScripts.comments.push.apply(scriptCommentsCleaned);
				else
					pageScripts.comments = scriptCommentsCleaned;
			}
		}
	}

	if(pageScripts.comments.length > 0) {
		scriptResults.unshift(pageScripts);
		console.log(pageScripts);
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

		var jsLink = getElement('a', 'gtfo-comments-treeview-url', null, scriptResults[i].file );
		if(scriptResults[i].location)
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

async function gtfo_Grabber() {
	if (!document.getElementById(randomString)) {
		originalBackgroundColor = window.getComputedStyle(document.body, null).backgroundColor;

		var newBody = getElement('body', randomString, null, null);

		// topbar
		var topBarDiv = getElement('div', 'gtfo-grabber-topbar', null, null);
		topBarDiv.appendChild(getPageButton('Page', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Urls', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Comments', true, 'gtfo-tab-button'));
		newBody.appendChild(topBarDiv);

		// add urls div
		newBody.appendChild(gtfo_GetUrlsDiv());

		// add comments div
		newBody.appendChild(await gtfo_GetCommentsDiv());

		// add old body
		newBody.appendChild(getPageDiv('Page', null, document.body.innerHTML));

		document.body = newBody;
	}
	else {
		alert("Grabber has already been executed!");
	}

	switchTab('Urls');
}

function onCreated(tab) {
	console.log(`Created new tab: ${tab.id}`)
}

function onError(error) {
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
		case 'gtfo_unhide':
			gtfo_Unhide();
			break;
		case 'gtfo_grabber':
			await gtfo_Grabber();
			break;
		case 'gtfo_rightclick':
			gtfo_RightClick();
			break;
	}

	return Promise.resolve(true);
});