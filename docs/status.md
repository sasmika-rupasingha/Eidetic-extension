# Eidetic status (v3.0.0, 20 November 2026)

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
| Privacy Shield | 7 kinds of sensitive data, located in the image; masked copy; blacked-out image download; "Hide part of the image" for anything the detector missed (drag, or keyboard: Enter adds, arrows move, Shift+arrows resize, Delete removes), black out or pixelate, detected details included; original untouched |
| Storage | Usage, remove expired / all temporary captures with confirmation, export library text as JSON (v3: full backup with images and import, space by kind / workspace / month, Clean up) |
| Onboarding and states | 3-step first run; loading, empty, error, offline OCR, AI unavailable, local model not running / refused, no models, permission help, storage full message |

## Planned

| Release | Items |
|---|---|
| Smaller items | A hands-on Firefox check of the panel and of the v2/v3 pages (see Known limitations); per-profile model choice (D13) |

## Known limitations

- **Website monitoring** checks only while the browser is running (alarms, every 15 minutes at most). Pages behind a login or CAPTCHA can't be checked (pages are downloaded without cookies); pages built by scripts may need "Check by opening the page", which opens the page in a background tab for a moment.

- **First capture on a site from the panel button:** Chrome hides a page's address from an extension that hasn't been given access, so Eidetic can't ask for "this site only" in that case. The panel explains the two ways in (shortcut on the page, or allow all sites). After the toolbar icon, shortcut or menu has been used on a page, the button works there.
- Detection is rule-based: unusual layouts can be classified as plain text. AI refinement (local) improves descriptions but doesn't change the category.
- OCR accuracy depends on the capture size; tiny or stylised text reads poorly.
- Chrome built-in AI needs a capable PC and Google Chrome; other Chromium browsers use Ollama, LM Studio or a key.
- Ollama needs `OLLAMA_ORIGINS` set to allow browser extensions.
- Search by meaning needs an embedding model in Ollama or LM Studio; without one, search is word-based (exact, prefix, typo-tolerant). Vectors are kept per model: switching models re-indexes in the background.
- **Firefox is checked by build, `web-ext lint` (0 errors; 8 warnings, all from bundled libraries or Chrome-only calls behind a Firefox check) and code review, not by an automated run:** Playwright can't load extensions into Firefox. In Firefox a click inside the sidebar doesn't give Eidetic access to the page (only the toolbar button, shortcut and menu do), so the panel's Capture button needs "Allow on all sites" or the shortcut, which the panel explains. Firefox doesn't let extensions open `about:addons`, so the panel and Settings describe the way to Eidetic's settings and shortcuts instead of linking.
- Reading a capture again in a language that has to be downloaded (e.g. Sinhala) is tested with mocked OCR, not end to end (the e2e run is offline).

## Test results (20 Nov 2026, v3.0.0)

- Types: clean. Lint (oxlint): clean.
- Unit: 168/168 passed (24 files), about 11 s. Tests run in Node; the files that render React or need the DOM (`markdown.test.tsx`, `access-help.test.tsx`, `hide-areas.test.tsx`, `monitor.test.ts`) use jsdom.
- End-to-end: 86/86 run checks passed in Edge via `CHROME_PATH`; 3 video checks skipped (no ffmpeg on this PC). Besides the v1 checks (OCR, reading again, detection, actions, streaming answers, follow-ups, local-only refinement, Auto vs Private routing, custom answer style, privacy, hiding areas, PDF viewer, browser pages, search, AI settings, themes, access help) the run covers: related captures with reasons and the link back, the topic filter, search by meaning with a mock Ollama `/api/embed` and the indexed count, workspaces (create, assign in bulk, filter, workspace page), compare (side by side, diff, merged table, cloud notice, one `<content index>` block per capture), study notebooks (generate and save, review a card, quiz score, progress, AI learning gaps on request), Capture & Compare (preset area, changed number old → new, added text, image difference), website monitoring (pick a part, check via the offscreen document, change listed, badge set and cleared), duplicates and the storage dashboard, and a full backup: export (no API keys), delete everything, import, library restored.
- Firefox build: `web-ext lint` 0 errors, 8 warnings (bundled libraries and Chrome-only calls behind a Firefox check, as in v1). Store packages: `dist/eidetic-chromium-3.0.0.zip`, `dist/eidetic-firefox-3.0.0.zip`.

## New in v3.0.0 Watch (20 Nov 2026)

- **Capture & Compare (D21):** "Compare with a new capture" on any capture takes a new capture of the same area: on the same page the selection starts on the old box (scaled if the window size changed), so Enter is enough. The new capture shows what changed since the baseline: numbers changed (old → new, with their label), lines changed, added and removed, and the new image with the changed pixels marked in red.
- **Website monitoring (D22):** "Watch part of this page" (panel, or right-click menu) highlights parts of the page under the mouse; click one (Up arrow takes a larger part, Esc cancels). Eidetic stores the address and a robust selector, asks for access to that site only, and checks it on a schedule (15 min to once a day) by downloading the page without cookies and reading the part with DOMParser (no page scripts run; Chrome uses an offscreen document for this). Changes appear on the Monitor page in the same categories as Capture & Compare, as a count on the toolbar icon, and, only if turned on, as a notification. Pages whose content is built by scripts can be checked with "Check by opening the page".
- **Duplicates and smart cleanup (D23):** every capture gets a perceptual hash (dHash, computed on this computer; older captures are filled in in the background). Settings › Clean up lists exact duplicates (same image, confirmed by SHA-256), similar images, near-identical text, old temporary captures and the largest captures. Each group suggests keeping the pinned, kept or annotated one (otherwise the newest) and pre-selects the rest; nothing is deleted until you confirm. Settings › Storage now shows the space used by kind, by workspace and by month.
- **Full backup and import (D24):** Settings › Storage › Back up everything saves one `.eidetic.json` file with every capture and its image (base64), notes, saved answers, links, workspaces, notebooks, watched pages and settings, with a format version and **without API keys**. Import checks everything as untrusted input (images must really be PNG, JPEG or WebP; detection and privacy findings are worked out again from the text), skips what is already in the library (same id, or the same image), keeps catalogue numbers unless taken, and reports what was added, skipped or left out. Restoring settings is optional and never touches the API keys on this computer.

## New in v2.0.0 Intelligence (20 Nov 2026)

- **Visual Memory (D16):** each processed capture is linked to earlier ones by rules on this computer (same video, same page close in time, same site in one sitting, shared topics/keywords, similar text by word shingles, the same error or detail). Links are stored both ways with a reason ("Same page, 10 min later"), shown as **Related** (up to 5) in the result view, and can be removed for good ("Not related"). The workspace library has a **Topic** filter built from AI topics and keywords.

- **Search by meaning (D17):** with a local embedding model (Ollama `/api/embed`, e.g. `nomic-embed-text`, or LM Studio `/v1/embeddings`), every capture gets a meaning vector, computed in small batches in the background while the panel or workspace is open. Searches show word results first, then **Similar in meaning** with the similarity. Settings › AI models › Search by meaning chooses the model and shows how many captures are indexed. Visual Memory uses the vectors as one more rule. Works in Private mode (local only).
- **Workspaces (D18):** named projects with a colour (the four accents) and a description, in the workspace tab (Workspaces). Captures are added one at a time (on the capture's page) or in bulk (library selection › Move to workspace); the library filters by workspace; a workspace's page lists its captures and notes. Deleting a workspace keeps its captures.
- **Compare and combine (D19):** select 2–8 captures in the library and press Compare: images and text side by side, a word-level text diff between any two (with how much is the same), their tables merged into one comparison table (Copy Markdown, Download CSV), and three AI actions over all of them: Combine into notes, Find contradictions, Build a comparison table. The page says where the text goes before anything is sent.
- **Study notebooks (D20):** on a capture's page (Study: flashcards and quiz) or when comparing captures, AI writes flashcards and a quiz as JSON; Eidetic validates them and saves them in a notebook (standalone or for a workspace). The Study page reviews due cards (Again / Good / Easy, spaced repetition with due dates), runs the quiz and keeps scores, and shows progress per notebook. **Learning gaps:** on request only, AI suggests what to study next from the questions answered wrongly, clearly labelled as AI.

## New in v1.1.0 (20 Nov 2026)

- Editable answer style for each AI profile (D13).
- Read a capture again in another language (D14).
- Hide part of the image: mark areas by hand for the safe image (D15).
- Firefox: the panel and Settings name Firefox, and explain the way to Eidetic's settings and shortcuts instead of links Firefox blocks.
- Unit tests run in Node, about 7 s instead of 56 s (D12).

## Fixed after v1.0.0 (20 Nov 2026)

- A capture refused for lack of access showed both a red "Couldn't capture" error and the access help; it now shows only the access help.
- When Eidetic is already allowed on all sites but a page still refuses capture, the panel no longer asks for access again. If Chrome hides the page's address (new tab, `chrome://` pages, the Web Store, a local file without "Allow access to file URLs") it says the page can't be captured and what to do; otherwise it suggests reloading the page or checking site settings, and links to Eidetic's details. Before, Eidetic only recognised browser pages when it could read their address, which Chrome hides.
- Chrome's Summarizer API is now always asked with an output language, so the "No output language was specified" warning no longer appears under the extension's Errors.

## Security and performance notes

- Permissions: `activeTab`, `scripting`, `storage`, `unlimitedStorage`, `contextMenus`, `sidePanel`, `alarms` (v3: scheduled checks of watched pages; no warning shown) and, in Chrome, `offscreen` (v3: reading watched pages with DOMParser, since the service worker has no DOM). `notifications` is optional and requested only when the user turns monitor notifications on. Hosts are optional and requested per provider, per watched site, or by the user. No content scripts on every page; no remote code; CSP `script-src 'self' 'wasm-unsafe-eval'`.
- Captured text is untrusted: it goes to models inside `<content>` tags with an instruction to treat it as data; answers render as React elements, never HTML; CSV export neutralises spreadsheet formulas.
- API keys are stored unencrypted in the browser's extension storage (like every extension; anyone with access to the Windows account could read them). Use keys with spending limits.
- Images are stored as PNG for best OCR; a large library of full-screen captures can use hundreds of MB. Storage shows usage and offers cleanup.
- Search builds its index in memory from the stored text; fine for thousands of captures, to be moved to a persistent index with v2.
