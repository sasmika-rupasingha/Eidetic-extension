# Plan: v2 Intelligence and v3 Watch

Builds on v1.1.0. Parts are built in this order, one after another; each part lands with its tests and a one-line status before the next starts. All rules in `docs/decisions.md` still apply: local-first, nothing leaves the computer except an AI action on a cloud provider the user added, captured text is untrusted data, design tokens, keyboard and both themes.

Release versions: **2.0.0** after part 5, **3.0.0** after part 9. Each part updates `docs/status.md` and records its design choices as the next `D<n>`.

## v2 Intelligence

### 1. Visual Memory (related captures)
- On each processed capture, compute links to earlier captures with **rules first**: same page or site + close in time, same video, shared keywords/topics, strong text overlap (word shingles), same detected kind + similar entities (e.g. the same error message).
- Store them in the existing `relations` field (`by: 'rules'`), each with a short human reason ("Same video, 4 min later"). The user can remove a link (`removed: true`, never recreated).
- Result view: a "Related" section (up to 5, with reasons, open on click). Library: a topic filter built from `ai.topics` / keywords.
- Tests: unit for each rule and the scoring; e2e: two captures of the same page show each other as related.

### 2. Search by meaning
- Embeddings from a **local** model only: Ollama `/api/embed` or LM Studio `/v1/embeddings`, when the user has one connected; Private mode unaffected. No in-browser model (would add a large dependency and model download; recorded as a decision).
- Embeddings stored per capture (new `embedding` field, with the model name); computed after processing and backfilled in the background in small batches while the panel/workspace is open.
- Search: word results first as today; when embeddings exist, add "Similar in meaning" results with their similarity. Visual Memory uses embeddings as one more rule when present.
- Tests: unit for cosine ranking and mixing with word search; e2e with the mock Ollama serving `/api/embed`.

### 3. Workspaces and projects
- Named workspaces (name, colour from the accent set, description) stored in the IndexedDB `meta` store (or a new `workspaces` store with a DB version bump that only adds stores).
- Assign captures (single or bulk) via `workspaceId`; filter the library by workspace; workspace page lists its captures and notes.
- Tests: unit for the store; e2e: create, assign, filter.

### 4. Multi-capture workspace (compare and combine)
- Select 2–8 captures (library checkboxes) → Compare view in the workspace tab: side-by-side images and text.
- Local: text diff between two captures; tables merged into one comparison table (CSV/Markdown export).
- AI actions (routed like others, cloud warning shown): Combine into notes, Find contradictions, Build a comparison table. Each capture's text goes in its own `<content index="n">` block.
- Tests: unit for diff and table merge, prompt shape; e2e with the mock Ollama.

### 5. Study notebooks
- From a capture or a selection: generate flashcards and a quiz (AI, JSON output, validated) and **save** them in a notebook (per workspace or standalone).
- Study page: review flashcards (again / good / easy, simple spaced repetition with due dates), take quizzes, see progress per notebook.
- "Learning-gap suggestions": AI, clearly labelled as AI, based on wrong answers and topics; only when the user asks.
- Tests: unit for parsing/validation and the review schedule; e2e: generate with the mock model, review a card, take a quiz.
- Bump to **2.0.0**.

## v3 Watch

### 6. Capture & Compare
- "Compare with a new capture" on any capture: take a new capture of the same page area (overlay pre-set to the old rectangle when on the same page), then show baseline vs new.
- Local change summary in categories: text added / removed / changed, numbers changed (with old → new), and an image difference overlay.
- Tests: unit for the change categories; e2e on a test page that changes between captures.

### 7. Website monitoring
- Monitor the **text of a chosen page area**: the user picks an element on the page (overlay mode that highlights elements), Eidetic stores the URL and a robust selector.
- Checks on a schedule with the `alarms` permission (new; added to the manifest and explained in `docs/status.md`), fetching the page with an optional host permission requested for that site only, parsing it with DOMParser in an offscreen/extension page (no scripts run) and comparing the text.
- Changes are listed in a Monitor page (with the categories from part 6) and shown as a badge; optional browser notification only if the user turns it on (needs `notifications`, requested when turned on).
- Limits: pages that build their content with scripts may not show the text when fetched; the Monitor page says so and offers "check by opening the page".
- Tests: unit for selector building and text comparison; e2e with a test page that changes.

### 8. Duplicates and smart cleanup
- Perceptual hash (dHash, implemented in `src/shared`, no dependency) in the existing `hash` field; backfilled for old captures.
- Cleanup page: exact duplicates, similar images, near-identical text, old temporary captures, largest captures; review before deleting (keep the newest/kept/pinned by default).
- Storage dashboard extends the v1 storage page (by kind, by workspace, by month).
- Tests: unit for dHash distance and grouping; e2e: two identical captures are offered as duplicates.

### 9. Full backup and import
- Export everything (captures with images, notes, answers, relations, workspaces, notebooks, monitors, settings **without API keys**) to one `.eidetic.json` file with base64 images and a format version.
- Import: validate everything (same validators as storage), merge without duplicates (by id and hash), report what was added/skipped. Never import API keys.
- Tests: unit for round-trip and validation of hostile input; e2e: export, clear, import, library restored.
- Bump to **3.0.0**, `npm run package`.

## Done when
Typecheck, lint, unit tests and e2e (in Edge on the owner's PC) pass after every part; Firefox build lints without errors; `docs/status.md`, the README and `docs/decisions.md` are up to date; a manual checklist for the owner covers what tests can't (real Chrome, Firefox, downloaded OCR languages, real local models).
