# Eidetic: architecture decisions

Short records of decisions that change scope or structure. Newest last.

### D1. Ship in three releases (Core, Intelligence, Watch)
The brief describes ~18 systems. Building all at once would leave most half-finished, against the brief's own "quality over rushing" and "no fake functionality" rules. v1 data structures include v2/v3 fields so later releases need no migration.

### D2. New project, reuse Lumen's tested modules
Eidetic is a new codebase with a clean modular layout. OCR, QR, overlay mechanics, table/entity extraction, AI request builders and streaming are adapted from Lumen with their tests, instead of rewritten.

### D3. Side panel as the main surface; full-page workspace tab for depth; no popup
One place to capture and see results, one place for long work. A popup would be a third surface with the same content.

### D4. The panel's Capture button never dead-ends
Lumen showed a bare "needs access" error when the panel button was used on a page not yet granted. Chrome hides a page's address from an extension without access, so a request for "this site only" is possible only when the address is known; Eidetic asks for that site when it can, and otherwise shows the two ways in, in place: the shortcut or right-click menu on the page, or "Allow on all sites" (optional). The `tabs` permission was rejected: its warning ("read your browsing history") is worse than the problem.

### D5. Rules-first detection, AI as refinement
Detection must work offline and without AI (brief §7). AI only improves the description, keywords and topics, and is labelled when it did.

### D6. Monitoring is text-based (v3)
Extensions cannot screenshot pages that are not open. Monitoring re-fetches the page and compares the text of the chosen area. Pages behind login, CAPTCHA or heavy client-side rendering are reported as unsupported rather than silently failing.

### D7. Search: local index first, embeddings later
Fast typo-tolerant full-text search in v1 with match reasons. Semantic search in v2 using local embeddings (Ollama or an in-browser model), never requiring the cloud.

### D8. "Avoid clutter" vs "don't remove functionality"
Resolved with progressive disclosure: every feature stays, advanced ones sit behind More or in the workspace tab.

### D9. Name: Eidetic
"Eidetic memory" means photographic memory; it describes Visual Memory exactly. No clash found in the Chrome or Firefox stores (Nov 2026).

### D10. Local-only automatic refinement
Descriptions are refined automatically only by a model on this computer. Cloud models are used only when the user presses an AI action, and the answer area says where the text goes before it is sent.

### D11. PNG for stored captures
OCR quality matters more than size; captures are stored as PNG with a small JPEG thumbnail. Storage settings show usage and offer cleanup.

### D12. Unit tests run in Node by default
Creating jsdom for every test file took most of the unit run (about 56 s). Tests now run in Node; a file that needs the DOM opts in with `// @vitest-environment jsdom` on its first line (only `markdown.test.tsx` today). Each file keeps its own isolated environment, so the fake IndexedDB is not shared between files.

### D13. Editable profiles change only the answer style
Users can rewrite each profile's answer style (up to 600 characters, Settings › AI models). The rest of the system prompt stays fixed and comes after the style: captured content is untrusted data inside `<content>` tags, answers are Markdown, no invented facts. This keeps the prompt-injection protection out of the user's (or a pasted text's) reach while still letting people shape answers. Per-profile model choice is left for later.

### D14. Reading a capture again in another language
A capture can be read again in a language chosen for it alone; the choice is stored on the capture (`ocrLangs`) and Settings stay the default for new captures. A language other than English is always read together with English, because slides and screenshots usually mix scripts. Reading again re-runs detection and the privacy scan and clears the AI description (it described the old text); saved answers and notes stay. The e2e run re-reads in English only, since other languages are downloaded from jsDelivr.

### D15. Hiding areas by hand: rectangles, not a free brush
The "blur brush" is a rectangle tool: drag, or use the keyboard (Enter adds, arrow keys move, Shift+arrow keys resize, Delete removes), so it works without a mouse and hides whole areas exactly. Areas are kept as fractions of the image and are not saved with the capture; only the downloaded safe copy changes. Hand-drawn areas are hidden exactly as drawn (detected details keep their small padding). Black out is the default; pixelate uses cells at least a third of the area's height so text can't be read back.

### D16. Visual Memory links are rules first, stored both ways
Links come from rules that work offline (same video, same page within 6 h, same site within 30 min, shared topics, word-shingle overlap of at least 25 %, the same error/event/link) plus, when both captures have them, embeddings from the same local model. A score threshold keeps weak single signals (e.g. same site alone) from linking. Links are stored on both captures with a reason from each one's point of view. Removing a link marks it `removed` on both sides so rules never recreate it. Links are recomputed after processing and after local refinement (new topics); user and AI links are never overwritten.

### D17. Search by meaning with local embedding models only
Vectors come from Ollama (`/api/embed`) or LM Studio (`/v1/embeddings`) on this computer, so captured text never leaves it and Private mode is unaffected. An in-browser model was rejected: it would add a large dependency and a model download to every install (this narrows D7). The vector is stored on the capture with the model's name; vectors from different models are never compared. It is computed in the background in batches of 8 while an Eidetic page is open (not in the service worker), and cleared when the description changes (refinement, reading again). Word results always come first; meaning results add what words missed, from 50 % similarity up.

### D18. One IndexedDB upgrade for the v2/v3 record stores
The database goes from version 1 to 2 once, adding three small stores (`workspaces`, `notebooks`, `monitors`, keyed by `id`) and touching nothing else, so v1 libraries open without migration. Captures keep pointing to a workspace through the existing `workspaceId` field; one capture belongs to at most one workspace (simple filters, no many-to-many bookkeeping). Every record is read through a validator, the same one the v3 import uses.

### D19. Compare: local first, each capture in its own content block
The diff and table merge run locally (word-level LCS, falling back to lines for very long texts; tables matched by column heading, with a Source column). AI actions over several captures put each capture in its own `<content index="n">` block under the same untrusted-data rule, and share a fixed text budget so eight captures can't overflow a small local model. Comparison is limited to 8 captures: beyond that, side-by-side columns stop being readable.

### D20. Study notebooks: validated JSON, a light SM-2 schedule
Flashcards and quizzes are generated as JSON and kept only after validation (non-empty question and answer, 2–6 distinct options, a correct answer index in range); anything else is dropped, and a reply with nothing usable is reported instead of saved. Reviews use three grades: Again (back in 10 minutes, ease −0.2), Good (1 day, 3 days, then interval × ease) and Easy (longer, ease +0.15); a card waiting 21 days or more counts as mastered. Learning-gap suggestions run only when the user asks, send only the wrongly answered questions and card titles, and are labelled as AI.

### D21. Capture & Compare stores the area and the baseline on the capture
Captures taken with the overlay now keep the chosen box and the viewport size (`area`), and a comparison capture keeps the id of its baseline (`compareTo`); both are optional fields, so no migration. The change summary is line-based: removed and added lines that share most words (or differ only in numbers) are paired as "changed", and numbers in a changed line are compared one by one only when both versions have the same count of numbers, so "old → new" is never a guess. The image difference compares pixels after scaling the baseline to the new size and ignores small differences (compression, anti-aliasing). The same summary is used by website monitoring.

### D22. Monitoring: fetched without cookies, parsed with DOMParser, selector by id/attributes first
Checks download the page with `credentials: 'omit'` (no logged-in content, nothing personal sent) and parse it with DOMParser, which never runs the page's scripts: in Firefox's background page directly, in Chrome in an offscreen document (new `offscreen` permission, no user-facing warning) because the service worker has no DOM. The new `alarms` permission wakes the background every 15 minutes; each monitor has its own interval. Access is requested for the watched site only, from the click that starts watching (or later from the Monitor page). The selector prefers stable ids and test/data attributes, then short class names, adds `:nth-of-type` only when needed, and skips generated-looking ids and classes; it must match exactly one element. Text is compared after normalising spaces, using the Capture & Compare summary. For script-built pages "Check by opening the page" opens a background tab, reads the part from the live page and closes it; it is never automatic. Notifications are optional (requested when turned on); the toolbar badge counts unseen changes.

### D23. Duplicates: dHash for look-alikes, SHA-256 only to confirm exact copies
The perceptual hash is a 64-bit dHash written in Eidetic (9 × 8 greyscale, OffscreenCanvas), stored in the existing `hash` field when a capture is processed, and filled in for older captures in the background. Images 6 bits apart or fewer are "similar". "Exact duplicates" are confirmed by SHA-256, computed only for captures that share a dHash and a file size, so a large library isn't read in full. Near-identical text uses the Visual Memory word shingles (90 % or more). Cleanup only suggests: pinned and kept captures are never pre-selected, and deleting always needs a confirmation that lists what goes.

### D24. Backup: one JSON file, never API keys, everything validated on import
A backup is a single `.eidetic.json` (format `eidetic-backup`, version 1) with images as base64: easy to keep and inspect, no new dependency (a zip would need one). API keys are blanked on export and never read on import; restoring settings is an opt-in and keeps the keys already on the computer. Import treats the file as hostile: ids must be plain, URLs must be http(s), images must decode and start with a real PNG/JPEG/WebP signature, sizes and lists are capped, and detection and privacy findings are recomputed from the text instead of trusted. Records already in the library (same id, or a capture with the same dHash and size) are skipped, so importing twice adds nothing. A newer format version is refused with a message to update Eidetic.
