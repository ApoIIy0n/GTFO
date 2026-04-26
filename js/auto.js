function gtfo_PatchNzbserverButtons() {
	for (let element of document.getElementsByClassName('nzbDownloadButton')) {
		if (element.hasAttribute('touched') || element.hasAttribute('GTFO'))
			continue;

		var href = element.getAttribute('href');
		if (!href)
			continue;

		element.setAttribute('GTFO', true);
		element.setAttribute('href', href.replace('nzbserver', 'clubnzb'));
	}
}

gtfo_PatchNzbserverButtons();

var gtfoNzbserverObserver = new MutationObserver((mutations) => {
	if (mutations.some((mutation) => mutation.target && mutation.target.id == 'overlay'))
		gtfo_PatchNzbserverButtons();
});
gtfoNzbserverObserver.observe(document, { childList: true, subtree: true });
