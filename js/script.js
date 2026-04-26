async function getActiveTab() {
	var tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (!tabs || tabs.length == 0)
		throw new Error('No active tab found.');
	return tabs[0];
}

async function openGrabberReport(data) {
	await browser.storage.local.set({ gtfo_grabber_data: data });
	return browser.tabs.create({ url: browser.runtime.getURL('html/grabber.html') });
}

async function sendTabMessage(subject, value) {
	try {
		var tab = await getActiveTab();

		if (subject != 'gtfo_grabber')
			await browser.tabs.insertCSS(tab.id, { file: '/css/page.css', allFrames: false });

		try {
			await browser.tabs.sendMessage(tab.id, { type: 'gtfo_ping' });
		}
		catch (error) {
			await browser.tabs.executeScript(tab.id, { file: '/js/content.js', allFrames: false });
		}

		var response = await browser.tabs.sendMessage(tab.id, { type: subject, params: value });
		if (subject == 'gtfo_grabber' && response && response.data)
			await openGrabberReport(response.data);

		window.close();
	}
	catch (error) {
		console.log(`Error: ${error}`);
		alert(`GTFO failed on this page: ${error.message || error}`);
	}
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

function injectPage(file, title) {
	var pageUrl = browser.runtime.getURL(file);
	getCurrentWindowTabs().then((tabs) => {
		var openTab = null;
		if (tabs) {
			for (let tab of tabs) {
				if (tab.url == pageUrl || tab.title == title)
					openTab = tab;
			}
		}

		if (!openTab) {
			let creating = browser.tabs.create({
				url: pageUrl
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
				injectPage("html/settings.html", "GTFO Settings");
				break;

		}
	});
}

listenForClicks();
