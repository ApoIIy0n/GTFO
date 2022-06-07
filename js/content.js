const randomize = (n, r='') => {
	while (n--) r += String.fromCharCode((r=Math.random()*62|0, r+=r>9?(r<36?55:61):48));
	return r;
};

var randomString = 'GTFO-BODY';//randomize(Math.floor(Math.random() * (8 - 2 + 1) + 2));

function removeClassFromElements(className) {
	const foundElements = document.getElementsByClassName(className);
	
	for (let foundElement of foundElements) {
		foundElement.classList.remove(className);
	}
}

function gtfo_Unhide() {
	var body = document.querySelector('body');
	if(!body.classList.contains(randomString)) {
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

function getPageButton(name) {
	var pageButton = document.createElement('button');
	pageButton.classList.add('gtfo-tab-button');
	pageButton.innerHTML = name;
	pageButton.onclick = function() { switchTab(name, this); }
	
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
	if(elmntId.includes('-') && name.includes('*')) {
		const elmntArray = elmntId.split('-');
		var lastElmnt = elmntArray[elmntArray.length - 1];
		if(!isNaN(lastElmnt)) {
			var toggleId = name.replace('*',lastElmnt);
			var inputElmnt = document.getElementById(toggleId);
			if(inputElmnt)
			{
				inputElmnt.checked = !inputElmnt.checked;
			}
		}
	}
}

function gtfo_Grabber() {
	if(!document.getElementById(randomString)) {		
		var newBody = document.createElement('body');
		newBody.setAttribute('id', randomString);
		
		var newTopDiv = document.createElement('div');
		newTopDiv.setAttribute('style', 'background-color: #1a1a1a');
		
		newTopDiv.appendChild(getPageButton('Page'));
		newTopDiv.appendChild(getPageButton('Grabber'));
		newBody.appendChild(newTopDiv);
		
		newBody.appendChild(getPageDiv('Page', null, document.body.innerHTML));
		
		// extract urls from object list to normal list
		const unfilteredLinks = [];
		for (let linkobject of document.links)
		{
			unfilteredLinks.push(decodeURI(linkobject.href));
		}
		
		// this removes the duplicates
		const pageLinks = [...new Set(unfilteredLinks)];
		pageLinks.sort();
		
		var grabberDiv = getPageDiv('Grabber', 'height: 100%; width: 100%; overflow: hidden; overflow-y:', null);
		
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
			urlLabel.onclick = function() { toggleInput('gtfo-input-*', this); }
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
		
		newTopDiv.appendChild(grabberDiv);
		
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
	switch(request.type) {
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
});