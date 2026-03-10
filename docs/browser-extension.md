# Browser Extension: DocForge Clipper

## Goal
Capture selected text from a webpage and ingest it into DocForge with one action.

## Location
`browser-extension/docforge-clipper`

## Capabilities
- Capture current selection from active tab
- Optional full-page excerpt fallback
- Send payload to `POST /clip`
- Store configurable API base URL in browser local storage
- Store and send DocForge app bearer token for authenticated clip ingestion

## Payload Sent
```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "author": "",
  "html": "captured text",
  "highlights": ["captured text"],
  "note": "optional user note"
}
```

## Setup (Chromium)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `browser-extension/docforge-clipper`
5. Open extension popup and set API base URL to `http://localhost:48080`
6. Paste a valid DocForge app token into `DocForge App Token`

## Notes
- API CORS is enabled for extension-origin requests.
- If `Capture Selection` has no selected text, use `Capture Page Excerpt`.
