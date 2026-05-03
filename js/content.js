var debugging = false;
var randomize = (n, r = '') => {
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

var gtfoTextFromUrlCache = new Map();

function gtfo_GetFetchCacheUrl(url) {
	try {
		var fetchUrl = new URL(url, document.baseURI);
		fetchUrl.hash = '';
		return fetchUrl.href;
	}
	catch (error) {
		return String(url || '');
	}
}

function gtfo_IsSameOriginUrl(url) {
	try {
		return new URL(url, document.baseURI).origin == window.location.origin;
	}
	catch (error) {
		return true;
	}
}

async function gtfo_FetchTextFromPage(url) {
	try {
		var response = await fetch(url);
		if (response.ok)
			return await response.text();
	}
	catch (error) {
		if (debugging)
			console.log(`Can't load source from page: ${url}`);
	}

	return null;
}

async function gtfo_FetchTextFromBackground(url) {
	if (typeof browser == 'object' && browser.runtime && browser.runtime.sendMessage) {
		try {
			var backgroundResponse = await browser.runtime.sendMessage({
				type: 'gtfo_fetch_text',
				url: url
			});

			if (backgroundResponse && backgroundResponse.ok)
				return typeof backgroundResponse.text == 'string' ? backgroundResponse.text : '';
		}
		catch (error) {
			if (debugging)
				console.log(`Can't load source through background: ${url}`);
		}
	}

	return null;
}

async function gtfo_LoadTextFromUrl(url) {
	if (gtfo_IsSameOriginUrl(url)) {
		var pageText = await gtfo_FetchTextFromPage(url);
		if (pageText !== null)
			return pageText;

		return await gtfo_FetchTextFromBackground(url);
	}

	var backgroundText = await gtfo_FetchTextFromBackground(url);
	if (backgroundText !== null)
		return backgroundText;

	return await gtfo_FetchTextFromPage(url);
}

async function gtfo_GetTextFromUrl(url) {
	var fetchUrl = gtfo_GetFetchCacheUrl(url);
	if (!fetchUrl)
		return null;

	if (!gtfoTextFromUrlCache.has(fetchUrl))
		gtfoTextFromUrlCache.set(fetchUrl, gtfo_LoadTextFromUrl(fetchUrl));

	return await gtfoTextFromUrlCache.get(fetchUrl);
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

async function gtfo_SetGrabberProgress(sessionId, progress, line) {
	if (!sessionId || typeof browser != 'object' || !browser.storage || !browser.storage.local)
		return;

	try {
		var result = await browser.storage.local.get('gtfo_grabber_session');
		var session = result.gtfo_grabber_session || {};
		var lines = Array.isArray(session.lines) ? session.lines.slice(-11) : [];
		lines.push(line);
		await browser.storage.local.set({
			gtfo_grabber_session: {
				...session,
				id: sessionId,
				status: 'loading',
				progress: progress,
				line: line,
				lines: lines
			}
		});
	}
	catch (error) {
		if (debugging)
			console.log(`GTFO progress update failed: ${error}`);
	}
}

function gtfo_GetEmbeddedDataBase(partial) {
	return {
		partial: !!partial,
		pageUrl: window.location.href,
		title: document.title || window.location.hostname || 'Page',
		host: window.location.hostname || window.location.host || 'page',
		url: window.location.href
	};
}

async function gtfo_PublishGrabberData(sessionId, data, progress, line, status) {
	if (!sessionId || typeof browser != 'object' || !browser.storage || !browser.storage.local)
		return;

	try {
		var result = await browser.storage.local.get('gtfo_grabber_session');
		var session = result.gtfo_grabber_session || {};
		var lines = Array.isArray(session.lines) ? session.lines.slice(-11) : [];
		lines.push(line);
		await browser.storage.local.set({
			gtfo_grabber_data: data,
			gtfo_grabber_session: {
				...session,
				id: sessionId,
				status: status || 'partial',
				progress: progress,
				line: line,
				lines: lines,
				dataReady: true
			}
		});
	}
	catch (error) {
		if (debugging)
			console.log(`GTFO data publish failed: ${error}`);
	}
}

async function gtfo_GetEmbeddedData(sessionId, preferredTab) {
	gtfoTextFromUrlCache.clear();
	preferredTab = preferredTab || 'Urls';
	var baseData = gtfo_GetEmbeddedDataBase(false);
	var partialPublished = false;

	function publishPartial(data, progress, line) {
		if (partialPublished)
			return Promise.resolve();

		partialPublished = true;
		return gtfo_PublishGrabberData(sessionId, data, progress, line, 'partial');
	}

	await gtfo_SetGrabberProgress(sessionId, 26, 'Scanning HTML comments');
	var htmlComments = gtfo_GetHtmlComments();
	var pageSource = null;
	var urls = null;
	var images = null;

	if (preferredTab == 'Urls') {
		await gtfo_SetGrabberProgress(sessionId, 34, 'Collecting links');
		urls = gtfo_GetUrlList();
		await publishPartial({
			...baseData,
			partial: true,
			urls: urls,
			images: [],
			js: [],
			css: [],
			html: {
				name: baseData.host,
				comments: htmlComments
			},
			comments: {
				html: htmlComments,
				javascript: []
			}
		}, 42, 'Rendering URLs');
	}
	else if (preferredTab == 'Images') {
		await gtfo_SetGrabberProgress(sessionId, 34, 'Collecting image references');
		images = gtfo_GetImageList();
		await publishPartial({
			...baseData,
			partial: true,
			urls: [],
			images: images,
			js: [],
			css: [],
			html: {
				name: baseData.host,
				comments: htmlComments
			},
			comments: {
				html: htmlComments,
				javascript: []
			}
		}, 42, 'Rendering images');
	}

	await gtfo_SetGrabberProgress(sessionId, 34, 'Indexing script sources');
	var scriptsPromise = gtfo_GetScriptList();
	await gtfo_SetGrabberProgress(sessionId, 44, 'Indexing stylesheets');
	var stylesheetsPromise = gtfo_GetCssList();
	await gtfo_SetGrabberProgress(sessionId, 54, 'Serializing page source');
	pageSource = gtfo_GetFullDocumentSource();
	if (!urls) {
		await gtfo_SetGrabberProgress(sessionId, 64, 'Collecting links');
		urls = gtfo_GetUrlList();
	}
	if (!images) {
		await gtfo_SetGrabberProgress(sessionId, 72, 'Collecting image references');
		images = gtfo_GetImageList();
	}
	await gtfo_SetGrabberProgress(sessionId, 82, 'Fetching external scripts and stylesheets');
	var scripts = await scriptsPromise;
	var stylesheets = await stylesheetsPromise;

	if (preferredTab == 'Sources') {
		await publishPartial({
			...baseData,
			partial: true,
			pageHtml: pageSource,
			html: {
				name: baseData.host,
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
		}, 90, 'Rendering sources');
	}

	await gtfo_SetGrabberProgress(sessionId, 92, 'Assembling report payload');

	return {
		...baseData,
		partial: false,
		pageUrl: window.location.href,
		title: document.title || window.location.hostname || 'Page',
		host: window.location.hostname || window.location.host || 'page',
		url: window.location.href,
		pageHtml: pageSource,
		html: {
			name: window.location.hostname || window.location.host || 'page',
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
			var embeddedData = await gtfo_GetEmbeddedData(
				request.params && request.params.sessionId,
				request.params && request.params.preferredTab
			);
			return Promise.resolve({
				data: embeddedData
			});
		case 'gtfo_rightclick':
			gtfo_RightClick();
			break;
	}

	return Promise.resolve(true);
});
