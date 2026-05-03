async function getActiveTab() {
	var tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (!tabs || tabs.length == 0)
		throw new Error('No active tab found.');
	return tabs[0];
}

async function sendGrabberMessage(preferredTab) {
	var tab = await getActiveTab();
	await browser.runtime.sendMessage({
		type: 'gtfo_start_grabber',
		tabId: tab.id,
		tabTitle: tab.title || '',
		tabUrl: tab.url || '',
		preferredTab: preferredTab || 'Urls'
	});
}

async function sendTabMessage(subject, value) {
	try {
		if (subject == 'gtfo_grabber') {
			await sendGrabberMessage(value && value.preferredTab ? value.preferredTab : 'Urls');
			window.close();
			return;
		}

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

function showPopupPane(paneId) {
	document.querySelectorAll('.gtfo-pane').forEach((pane) => {
		pane.classList.toggle('gtfo-pane-active', pane.id == paneId);
	});
}

function listenForClicks() {
	document.addEventListener("click", (e) => {
		var selectedElement = e.target.closest('[id]');
		var selected = selectedElement ? selectedElement.id : '';

		switch (selected) {
			case "gtfo_grabber":
				showPopupPane('gtfo_grabber_pane');
				break;
			case "gtfo_back_main":
				showPopupPane('gtfo_main_pane');
				break;
			case "gtfo_grabber_urls":
				sendTabMessage("gtfo_grabber", { preferredTab: 'Urls' });
				break;
			case "gtfo_grabber_sources":
				sendTabMessage("gtfo_grabber", { preferredTab: 'Sources' });
				break;
			case "gtfo_grabber_images":
				sendTabMessage("gtfo_grabber", { preferredTab: 'Images' });
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
