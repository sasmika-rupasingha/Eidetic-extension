# Eidetic status (v1.0.0, 20 November 2026)

What is finished, what isn't, and what is known to be limited. Nothing listed as done is a placeholder.

## Done in v1

| Area | What works |
|---|---|
| Design system | Tokens for every colour, size and motion; light (warm paper) and dark (graphite) themes designed separately; System option; four accents; applied instantly without reload or flash; remembered; reduced motion; visible focus; 44 px targets |
| Smart Capture | Shortcut, right-click menu (area / visible page), panel buttons; frozen overlay with drag, 8 resize handles, move, arrow-key nudge, Enter / F / Esc, focus kept in its toolbar; paste, drop and open-file; PDF viewer (overlay, or crop in the panel when a page refuses scripts) |
| OCR | Offline Tesseract in a worker, reused and closed when idle; 16 languages selectable (English built in, others downloaded once); QR codes; each capture says which languages it was read in and can be read again in another one (with English, for mixed slides), which re-detects it, re-scans it for private details and refreshes the local description |
| Detection | Rules-first classifier for 15 kinds with specific descriptions; optional refinement by a *local* model only, labelled with the model's name |
| Actions | Per-kind primary / secondary / More; local actions: copy text, error, code, equation, table (Excel, Markdown, CSV), calendar link with time and place, vCard, email, call, open/copy link, web search, read aloud, download image, safe copy; AI actions: 28 tasks |
| AI Model Hub | 8 providers; model discovery; vision / code / context detection (Ollama /api/show, LM Studio /api/v0/models, names otherwise; a model that rejects an image is remembered as text-only and the request is retried with text); connection status with recovery hints; Test buttons; default model per provider |
| Routing | Auto / Manual / Private; per-class choice in Manual; reasons shown ("Why this model?"); Private enforced in router and request layer; translation uses Chrome's on-device translator first when available |
| Profiles | General, Study, Developer, Research, Writing (answer style); each style editable in your own words (Settings › AI models), with Reset to default. Only the style line is editable: the rules that captured text is untrusted data, Markdown answers and no invented facts always stay and come after it |
| Answers | Streaming Markdown (never HTML), stop, follow-up conversation, saved with the capture, "Sends the text to …" shown before cloud requests |
| Library | IndexedDB; catalogue numbers; temporary vs kept; pins; notes; typo-tolerant search with match reasons; filters; bulk keep/delete with preview; workspace tab at full width |
| Video | Timestamp, duration, title; resume link only where real (YouTube, video files) |
| Privacy Shield | 7 kinds of sensitive data, located in the image; masked copy; blacked-out image download; original untouched |
| Storage | Usage, remove expired / all temporary captures with confirmation, export library text as JSON |
| Onboarding and states | 3-step first run; loading, empty, error, offline OCR, AI unavailable, local model not running / refused, no models, permission help, storage full message |

## Not in v1 (planned)

| Release | Items |
|---|---|
| v2 Intelligence | Visual Memory connections between captures (fields already in the data model), multi-capture workspace (compare, combine, contradictions, comparison tables), workspaces and projects, Study notebooks with saved flashcards / quizzes and progress, learning-gap suggestions, semantic search with local embeddings |
| v3 Watch | Capture & Compare, website monitoring (text of a chosen area), duplicate / similar detection, smart cleanup, full backup with images and import |
| Smaller items | A blur brush for areas the detector didn't find; Firefox-specific testing of the panel button |

## Known limitations

- **First capture on a site from the panel button:** Chrome hides a page's address from an extension that hasn't been given access, so Eidetic can't ask for "this site only" in that case. The panel explains the two ways in (shortcut on the page, or allow all sites). After the toolbar icon, shortcut or menu has been used on a page, the button works there.
- Detection is rule-based: unusual layouts can be classified as plain text. AI refinement (local) improves descriptions but doesn't change the category.
- OCR accuracy depends on the capture size; tiny or stylised text reads poorly.
- Chrome built-in AI needs a capable PC and Google Chrome; other Chromium browsers use Ollama, LM Studio or a key.
- Ollama needs `OLLAMA_ORIGINS` set to allow browser extensions.
- Search is word-based (exact, prefix, typo-tolerant); search by meaning comes with v2.

## Test results (20 Nov 2026)

- Types: clean. Lint (oxlint): clean.
- Unit: 95/95 passed (14 files), about 8 s. Tests run in Node; only the files that render React (`markdown.test.tsx`, `access-help.test.tsx`) use jsdom.
- End-to-end: 49/49 run checks passed in Edge 157 via `CHROME_PATH` (OCR, reading a capture again, detection, actions, streaming answers, follow-ups, local-only refinement, Auto vs Private routing against a mock cloud provider, custom answer style sent to the model and reset, privacy, PDF viewer, browser pages, search, AI settings, themes, access help shown as one message). The 3 video checks were skipped (no ffmpeg on this PC). Playwright's Chromium 159 (build 1255) doesn't start on Windows 11 build 26300 ("side-by-side configuration is incorrect").

## Fixed after v1.0.0 (20 Nov 2026)

- A capture refused for lack of access showed both a red "Couldn't capture" error and the access help; it now shows only the access help.
- When Eidetic is already allowed on all sites but a page still refuses capture, the panel no longer asks for access again. If Chrome hides the page's address (new tab, `chrome://` pages, the Web Store, a local file without "Allow access to file URLs") it says the page can't be captured and what to do; otherwise it suggests reloading the page or checking site settings, and links to Eidetic's details. Before, Eidetic only recognised browser pages when it could read their address, which Chrome hides.
- Chrome's Summarizer API is now always asked with an output language, so the "No output language was specified" warning no longer appears under the extension's Errors.

## Security and performance notes

- Permissions: `activeTab`, `scripting`, `storage`, `unlimitedStorage`, `contextMenus`, `sidePanel`; hosts are optional and requested per provider or by the user. No content scripts on every page; no remote code; CSP `script-src 'self' 'wasm-unsafe-eval'`.
- Captured text is untrusted: it goes to models inside `<content>` tags with an instruction to treat it as data; answers render as React elements, never HTML; CSV export neutralises spreadsheet formulas.
- API keys are stored unencrypted in the browser's extension storage (like every extension; anyone with access to the Windows account could read them). Use keys with spending limits.
- Images are stored as PNG for best OCR; a large library of full-screen captures can use hundreds of MB. Storage shows usage and offers cleanup.
- Search builds its index in memory from the stored text; fine for thousands of captures, to be moved to a persistent index with v2.
