function getActiveTab() {
	return browser.tabs.query({ active: true, currentWindow: true });
}

function sendTabMessage(subject, value) {
	getActiveTab().then((tabs) => {
		browser.tabs.insertCSS(tabs[0].id, { file: '../css/page.css', allFrames: true });
		browser.tabs.sendMessage(tabs[0].id, { type: subject, params: value }).then(response => {
			if (response)
				window.close();
		});
	});
}

function getCurrentWindowTabs() {
	return browser.tabs.query({ currentWindow: true });
}

function switchTab(tab) {
	if (tab) {
		browser.tabs.update(tab.id, { active: true });
		window.close();
	}
}

function onCreated(tab) {
	switchTab(tab);
}

function onError(error) {
	console.log(`Error: ${error}`);
}

function injectPage(type, file, title) {
	var tabs = getCurrentWindowTabs().then((tabs) => {
		var openTab = null;
		if (tabs) {
			for (let tab of tabs) {
				if (tab.title == title)
					openTab = tab;
			}
		}

		if (!openTab) {
			let creating = browser.tabs.create({
				"url": file
			});
			creating.then(onCreated, onError);
		}
		else {
			console.log(`${title} is already open`);
			switchTab(openTab);
		}
	});
}

function listenForClicks() {
	document.addEventListener("click", (e) => {
		var selected = e.target.id;
		var closeWindow = false;

		switch (selected) {
			case "gtfo_grabber":
				sendTabMessage("gtfo_grabber", null);
				break;
			case "gtfo_unhide":
				sendTabMessage("gtfo_unhide", null);
				break;
			case "gtfo_rightclick":
				sendTabMessage("gtfo_rightclick", null);
				break;
			case "gtfo_settings":
				injectPage("url", "../html/settings.html", "GTFO Settings");
				break;

		}
	});
}

listenForClicks();