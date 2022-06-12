const randomize = (n, r = '') => {
	while (n--) r += String.fromCharCode((r = Math.random() * 62 | 0, r += r > 9 ? (r < 36 ? 55 : 61) : 48));
	return r;
};

// set to a fixed string for now because of CSS styling
var randomString = 'GTFO-BODY';//randomize(Math.floor(Math.random() * (8 - 2 + 1) + 2));

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
	console.log(elmnt);
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

function gtfo_Grabber() {
	if (!document.getElementById(randomString)) {
		var newBody = getElement('body', randomString, null, null);

		// topbar
		var topBarDiv = getElement('div', null, 'gtfo-grabber-topbar', null);
		topBarDiv.appendChild(getPageButton('Page', true, 'gtfo-tab-button'));
		topBarDiv.appendChild(getPageButton('Grabber', true, 'gtfo-tab-button'));
		newBody.appendChild(topBarDiv);

		// extract urls from object list to normal list
		const unfilteredLinks = [];
		for (let linkobject of document.links) {
			unfilteredLinks.push(decodeURI(linkobject.href));
		}

		// this removes the duplicates
		const pageLinks = [...new Set(unfilteredLinks)];
		pageLinks.sort();

		var grabberDiv = getPageDiv('Grabber', 'height: 100%; width: 100%; overflow: hidden; overflow-y:', null);

		// toolbar
		var toolBarDiv = getElement('div', null, 'gtfo-grabber-toolbar', null);

		var toolbarSaveButton = getElement('button', null, 'gtfo-topbar-button', 'Save');
		toolbarSaveButton.onclick = function () { gtfo_Grabber_Save(); }
		toolBarDiv.appendChild(toolbarSaveButton);

		var toolbarCopyButton = getElement('button', null, 'gtfo-topbar-button', 'Copy');
		toolbarCopyButton.onclick = function () { gtfo_Grabber_Copy(); }
		toolBarDiv.appendChild(toolbarCopyButton);

		var selectinput = getElement('input', `gtfo-grabber-selectall`, 'gtfo-grabber-selectall', null);
		selectinput.type = 'checkbox';
		selectinput.onclick = function () { gtfo_Grabber_SelectAll(this); }
		toolBarDiv.appendChild(selectinput);

		var selectallLabel = getElement('label', `gtfo-selectall-label`, 'gtfo-selectall-label', 'Select all');
		toolBarDiv.appendChild(selectallLabel);

		grabberDiv.appendChild(toolBarDiv);

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
			var urlLink = getElement('a', null, 'gtfo-grabber-url', `${zeroString}${(i + 1)}: ${pageLinks[i]}`);
			urlLink.href = pageLinks[i];
			urlLabel.appendChild(urlLink);

			elemDiv.appendChild(urlLabel);
			grabberDiv.appendChild(elemDiv);
		}

		// urlspage
		var urlsDiv = getElement('div', null, 'gtfo-url-div', null);
		urlsDiv.appendChild(grabberDiv);
		newBody.appendChild(urlsDiv);

		// add old body
		newBody.appendChild(getPageDiv('Page', null, document.body.innerHTML));

		document.body = newBody;
	}
	else {
		alert("Grabber has already been executed!");
	}

	switchTab('Grabber');
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

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch (request.type) {
		case 'gtfo_unhide':
			gtfo_Unhide();
			break;
		case 'gtfo_grabber':
			gtfo_Grabber();
			break;
		case 'gtfo_rightclick':
			gtfo_RightClick();
			break;
	}

	return Promise.resolve(true);
});