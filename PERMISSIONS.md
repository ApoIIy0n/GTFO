# Permissions

GTFO is a Firefox extension that helps inspect, collect, reveal, and export information from web pages.

Because GTFO works directly with the currently opened page, it needs certain browser permissions. This document explains what each permission is used for and why it is needed.

## Current permissions

```json
{
  "permissions": [
    "tabs",
    "downloads",
    "storage",
    "<all_urls>"
  ]
}
```

## `tabs`

GTFO uses the `tabs` permission to work with the currently active browser tab.

This is used for actions such as:

- detecting the active tab
- opening the GTFO report/grabber page
- passing the current page URL or tab information to the extension
- coordinating actions between the popup, content scripts, and report page

GTFO does not use this permission to monitor your browsing history in the background.

## `<all_urls>`

GTFO uses `<all_urls>` so it can run on and inspect pages across different websites.

This is needed because GTFO features are designed to work on arbitrary web pages, not only on one specific domain.

This permission allows GTFO to:

- inspect links on the current page
- inspect images on the current page
- collect visible page information
- reveal hidden page elements
- re-enable blocked right-click behavior
- inject helper scripts and styles into supported pages

This permission is broad because the extension is intended to be a general-purpose page inspection tool.

GTFO does not use this permission to send your page contents to an external server.

## `storage`

GTFO uses the `storage` permission to save temporary extension state and feature data.

This may include things such as:

- grabber session data
- collected page results
- temporary report data
- extension settings, if settings are enabled in a future version

Storage is used locally by the extension.

GTFO does not use this permission to upload stored data to an external server.

## `downloads`

GTFO uses the `downloads` permission when exporting or saving collected results.

This allows the extension to use Firefox’s downloads API, which provides better control over generated files than a normal browser link download.

This may be used for:

- saving extracted URLs
- saving image lists
- saving collected page data
- saving generated reports
- offering a Save As dialog
- choosing reliable filenames for exported files

Firefox describes this permission as:

> Download files and read and modify the browser’s download history

That warning appears because Firefox’s downloads API includes access to browser download functionality. GTFO uses this permission only for extension-created exports/downloads.

## Why some permission warnings sound broad

Browser permission warnings are written by Firefox, not by GTFO.

Some Firefox permissions sound broad because the browser describes the maximum technical ability granted by the permission, not only the specific way GTFO uses it.

For example, the `downloads` permission may mention reading and modifying download history because the downloads API technically allows access to download-related browser data. GTFO uses it for creating extension downloads and exports.

## Data handling

GTFO is designed to run locally in your browser.

Unless explicitly stated otherwise:

- GTFO does not send collected page data to an external server.
- GTFO does not sell or share browsing data.
- GTFO does not track users across websites.
- GTFO does not inject third-party analytics.
- GTFO does not collect passwords, cookies, or authentication tokens intentionally.

Users should still review the source code and permissions before installing any browser extension, especially one that can inspect web pages.

## Permission minimization

GTFO aims to keep permissions limited to what is needed for its features.

If a permission is no longer required, it should be removed from `manifest.json`.

Planned permission review checklist:

- Remove `downloads` if exports can be handled safely without the downloads API.
- Remove `storage` if persistent or temporary extension storage is no longer used.
- Replace `<all_urls>` with narrower host permissions if the extension becomes domain-specific.
- Avoid adding new permissions unless a feature clearly requires them.

## Summary

| Permission | Why GTFO needs it |
|---|---|
| `tabs` | To identify and work with the active tab |
| `<all_urls>` | To inspect and interact with arbitrary web pages |
| `storage` | To store local extension state and collected results |
| `downloads` | To export/save generated files using Firefox’s downloads API |