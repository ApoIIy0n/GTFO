browser.runtime.onMessage.addListener(async (request) => {
	if (!request || request.type != 'gtfo_fetch_text')
		return false;

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
});
