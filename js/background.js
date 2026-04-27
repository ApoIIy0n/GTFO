function gtfoCreateSessionId() {
	return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function gtfoSetGrabberProgress(session, progress, line, data) {
	await browser.storage.local.set({
		gtfo_grabber_session: {
			id: session.id,
			status: data ? 'complete' : 'loading',
			preferredTab: session.preferredTab,
			progress: progress,
			line: line,
			lines: (session.lines = session.lines.concat([line]).slice(-12)),
			dataReady: !!data
		}
	});
}

async function gtfoStartGrabber(request) {
	var session = {
		id: gtfoCreateSessionId(),
		preferredTab: request.preferredTab || 'Urls',
		lines: []
	};
	var tabLabel = request.tabTitle || request.tabUrl || 'active tab';

	await browser.storage.local.remove('gtfo_grabber_data');
	await gtfoSetGrabberProgress(session, 0, `Loading page: ${tabLabel}`);
	await browser.tabs.create({ url: browser.runtime.getURL('html/grabber.html') });

	try {
		await gtfoSetGrabberProgress(session, 10, 'Preparing page scanner');
		await browser.tabs.sendMessage(request.tabId, { type: 'gtfo_ping' });
	}
	catch (error) {
		await gtfoSetGrabberProgress(session, 10, 'Preparing page scanner');
		await browser.tabs.executeScript(request.tabId, { file: '/js/content.js', allFrames: false });
	}

	await gtfoSetGrabberProgress(session, 20, 'Collecting page data');
	var response = await browser.tabs.sendMessage(request.tabId, {
		type: 'gtfo_grabber',
		params: {
			sessionId: session.id,
			preferredTab: session.preferredTab
		}
	});

	if (response && response.data) {
		await browser.storage.local.set({ gtfo_grabber_data: response.data });
		await gtfoSetGrabberProgress(session, 100, 'Rendering report', true);
		return;
	}

	await gtfoSetGrabberProgress(session, 100, 'Finished without report data');
}

async function gtfoFetchText(request) {
	try {
		var response = await fetch(request.url, {
			credentials: 'omit',
			cache: 'force-cache'
		});

		if (!response.ok)
			return {
				ok: false,
				status: response.status,
				statusText: response.statusText
			};

		return {
			ok: true,
			text: await response.text()
		};
	}
	catch (error) {
		return {
			ok: false,
			error: error.message || String(error)
		};
	}
}

browser.runtime.onMessage.addListener(async (request) => {
	if (!request)
		return false;

	if (request.type == 'gtfo_start_grabber') {
		gtfoStartGrabber(request).catch((error) => {
			console.log(`GTFO grabber failed: ${error.message || error}`);
			browser.storage.local.get('gtfo_grabber_session').then((result) => {
				var session = result.gtfo_grabber_session || {};
				var lines = Array.isArray(session.lines) ? session.lines.slice(-11) : [];
				lines.push(`error: ${error.message || error}`);
				return browser.storage.local.set({
					gtfo_grabber_session: {
						...session,
						status: 'error',
						progress: 100,
						line: lines[lines.length - 1],
						lines: lines,
						dataReady: false
					}
				});
			});
		});
		return true;
	}

	if (request.type == 'gtfo_fetch_text')
		return gtfoFetchText(request);

	return false;
});
