# GTFO

GTFO is a Firefox WebExtension that bundles a set of small page-inspection and page-fixing tools into one popup.

It is mainly built for quickly inspecting the current page, collecting URLs and images, finding comments in page source files, and forcing annoying pages to behave normally again.

## Features

### Grabber

Generates a local GTFO report for the active tab with four views:

- **Page** — shows the captured page inside an embedded iframe.
- **Urls** — lists unique links, script URLs, stylesheet URLs, and image URLs found on the page.
- **Comments** — extracts HTML, JavaScript, and CSS comments and shows them next to the related source.
- **Images** — displays images in selectable grid sizes with pagination or a scrollable “Show all” mode.

The URL view also supports:

- Select all
- Copy selected URLs to the clipboard
- Save selected URLs as a `.txt` file

The comments view also supports:

- Source preview
- Syntax highlighting
- Source prettifying
- Comment highlighting
- Basic folding for large HTML, JavaScript, and CSS sections
- Multi-select comment highlighting with `Alt` click

### UnHide

Attempts to make hidden page content visible again by removing common hiding classes and forcing the page body back into view.

### RightClick

Restores normal right-click behavior on pages that try to block the context menu.

## Installation

### Temporary installation for development

1. Clone or download this repository.
2. Open Firefox.
3. Go to `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on...**.
5. Select the project’s `manifest.json` file.
6. Click the GTFO icon in the toolbar and choose a tool.

Temporary add-ons are removed when Firefox restarts. Reload the extension from the same page after making changes.

### Permanent installation

Visit https://addons.mozilla.org/en-US/firefox/addon/gtfo/

## Usage

1. Navigate to any page.
2. Open the GTFO extension popup.
3. Choose one of the available actions:
   - **Grabber** opens a new local report tab for the current page.
   - **RightClick** attempts to re-enable the context menu.
   - **UnHide** attempts to reveal hidden page elements.
   - **Settings** currently opens a placeholder settings page.

## Project structure

```text
GTFO/
├── css/
│   ├── page.css          # Styles injected into target pages for older/in-page UI helpers
│   └── stylesheet.css    # Popup/settings styling
├── html/
│   ├── grabber.html      # Local report page used by the Grabber
│   └── settings.html     # Settings placeholder
├── icons/
│   └── GTFO.png          # Extension icon
├── js/
│   ├── background.js     # Reserved for future background logic
│   ├── content.js        # Content script and page-data collection logic
│   ├── grabber.js        # Local Grabber report UI
│   └── script.js         # Popup actions and tab communication
├── popup/
│   └── popup.html        # Browser action popup
└── manifest.json         # Firefox WebExtension manifest
```

## Permissions

GTFO uses these extension permissions:

- `tabs` — to find the active tab and open report/settings tabs.
- `<all_urls>` — to run tools on pages and read page resources where the browser allows it.
- `storage` — to pass captured Grabber data from the active page to the local report page.

## Privacy

GTFO is designed to run locally in the browser.

The Grabber collects page data from the active tab and stores it temporarily in local extension storage so the report page can render it. It does not intentionally send captured URLs, comments, source, or images to an external server.

Browser and website security restrictions still apply. Some cross-origin scripts, stylesheets, images, or protected pages may not be readable by the extension.

## Development notes

This extension currently uses **Manifest V2** and Firefox’s `browser.*` WebExtension APIs.

Main flow:

1. `popup/popup.html` loads `js/script.js`.
2. When the user clicks **Grabber**, `script.js` sends a message to the active tab.
3. `js/content.js` collects page URLs, comments, scripts, stylesheets, images, and page source.
4. The collected data is saved in `browser.storage.local`.
5. `html/grabber.html` opens in a new tab and `js/grabber.js` renders the report.

Useful files to edit:

- Edit popup buttons in `popup/popup.html`.
- Edit popup styling in `css/stylesheet.css`.
- Edit active-page collection logic in `js/content.js`.
- Edit the report UI in `html/grabber.html` and `js/grabber.js`.

## Known limitations

- The Settings page is currently a placeholder.
- Some external resources may fail to load due to CORS, CSP, authentication, mixed-content rules, or browser security restrictions.
- Image extraction depends on available `img`, `currentSrc`, `src`, and inline `background-image` values.
- The project currently targets Firefox and has not been fully prepared for Chromium-based browsers.

## Roadmap ideas

- Add real settings for enabling/disabling individual tools.
- Add export options for the full Grabber report.
- Add filters/search to the URL, image, and comment views.
- Add more robust background-image discovery from computed styles.

## Contributing

Pull requests are welcome. Keep changes focused, test them in Firefox via `about:debugging`, and include a short explanation of what changed.

## MIT License

Copyright (c) 2026 Apollyon (github.com/ApoIIy0n)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.