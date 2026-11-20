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
