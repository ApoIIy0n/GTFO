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

function getPageButton(name, enabled, className) {
	var pageButton = document.createElement('button');
	pageButton.id = `${className}-${name}`;
	if (!enabled)
		pageButton.setAttribute('disabled', true);
	pageButton.classList.add(className);
	pageButton.textContent = name;
	pageButton.onclick = function () { switchTab(name, this); }

	return pageButton;
}

function getPageDiv(name, style, innerhtml) {
	var pageDiv = document.createElement('div');
	pageDiv.setAttribute('id', name);
	pageDiv.classList.add('tabcontent');

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
			for (childNode of checkBox.parentNode.childNodes)
			{
				if(childNode.id.includes("urllabel") && childNode.children.length > 0) {	
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
	downloadLink.href = "data:application/octet-stream,"+encodeURIComponent(selectedItems.join('\r\n'));
	downloadLink.download = `urls_${new Date().getTime()}.txt`;
	downloadLink.click();
	document.removeelem
}

function gtfo_Grabber() {
	if (!document.getElementById(randomString)) {
		var newBody = document.createElement('body');
		newBody.setAttribute('id', randomString);

		// topbar
		var topBarDiv = document.createElement('div');
		topBarDiv.classList.add('gtfo-grabber-topbar');
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
		var toolBarDiv = document.createElement('div');
		toolBarDiv.classList.add('gtfo-grabber-toolbar');

		var toolbarSaveButton = document.createElement('button');
		toolbarSaveButton.classList.add('gtfo-topbar-button')
		toolbarSaveButton.innerHTML = 'Save';
		toolbarSaveButton.onclick = function() { gtfo_Grabber_Save(); }
		toolBarDiv.appendChild(toolbarSaveButton);

		var toolbarCopyButton = document.createElement('button');
		toolbarCopyButton.classList.add('gtfo-topbar-button')
		toolbarCopyButton.innerHTML = 'Copy';
		toolbarCopyButton.onclick = function() { gtfo_Grabber_Copy(); }
		toolBarDiv.appendChild(toolbarCopyButton);

		var selectinput = document.createElement('input');
		selectinput.classList.add('gtfo-grabber-selectall');
		selectinput.onclick = function () { gtfo_Grabber_SelectAll(this); }
		selectinput.type = 'checkbox';
		selectinput.id = `gtfo-grabber-selectall`;
		toolBarDiv.appendChild(selectinput);

		var selectallLabel = document.createElement('label');
		selectallLabel.classList.add('gtfo-selectall-label');
		selectallLabel.id = `gtfo-selectall-label`;
		selectallLabel.textContent = 'Select all';
		toolBarDiv.appendChild(selectallLabel);

		grabberDiv.appendChild(toolBarDiv);

		var urlColorClass;
		const totalDigits = pageLinks.length.toString().length;

		for (let i = 0; i < pageLinks.length; i++) {
			urlColorClass = ((i + 1) % 2) ? 'gtfo-grabber-url-even' : 'gtfo-grabber-url-odd';

			var a = document.createElement('a');
			a.classList.add('gtfo-grabber-url');
			a.href = pageLinks[i];

			var zeroString = '0'.repeat(totalDigits - (i + 1).toString().length);
			a.innerText = `${zeroString}${(i + 1)}: ${pageLinks[i]}`;

			var urlLabel = document.createElement('label');
			urlLabel.classList.add('gtfo-url-label');
			urlLabel.id = `gtfo-urllabel-${i + 1}`;
			urlLabel.onclick = function () { toggleInput('gtfo-input-*', this); }
			urlLabel.appendChild(a);

			var input = document.createElement('input');
			input.classList.add('gtfo-tab-input');
			input.type = 'checkbox';
			input.id = `gtfo-input-${i + 1}`;

			var elemDiv = document.createElement('div');
			elemDiv.classList.add(urlColorClass);
			elemDiv.id = `gtfo-urldiv-${i + 1}`;
			elemDiv.appendChild(input);
			elemDiv.appendChild(urlLabel);

			grabberDiv.appendChild(elemDiv);
		}

		// urlspage
		var urlsDiv = document.createElement('div');
		urlsDiv.classList.add('gtfo-url-div');
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