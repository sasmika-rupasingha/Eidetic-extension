# Eidetic: product spec

**A visual memory for everything you see online.**

See something → Capture it → Understand it → Connect it → Use it.

Eidetic is a browser extension (Chrome, Edge, Brave, Opera, Vivaldi, Arc; Firefox later) that turns anything on screen into knowledge you can search, connect, compare and act on. It is local-first, free for core features, and fully useful without any AI. AI makes it smarter, from the user's own local models (Ollama, LM Studio), Chrome's built-in AI, or the user's own API key.

Source brief: `docs/brief.md`. This spec is the agreed interpretation of that brief; where the two differ, this file wins and the reason is in `docs/decisions.md`.

---

## 1. Who it is for

| Person | Typical capture | What they want next |
|---|---|---|
| Student | Lecture slide, exam question, video lecture frame | Explanation, notes, flashcards, quiz |
| Developer | Error message, code screenshot, docs snippet | Cause, fix, corrected code |
| Researcher | Paper figure, results table, abstract | Findings, comparison across papers |
| Shopper | Product specs, prices | Side-by-side comparison, missing info |
| Job seeker | Job advertisement | Required skills, gap checklist |
| Everyone | Event poster, contact card, QR code, receipt | Calendar entry, contact, link, totals |

## 2. Product rules (from the brief)

1. Capture → best action in under two seconds. One primary action, two or three secondary, the rest under **More**.
2. Works offline and without AI: capture, OCR, QR, detection, tables, search, library, privacy detection.
3. AI is optional, provider-neutral, and never silent: the UI shows when content leaves the computer and to which provider.
4. **Private mode** guarantees local-only processing.
5. No fake data, no decorative buttons, no placeholder output presented as real.
6. Errors always say what to do next.
7. Nothing is deleted without preview and confirmation.

## 3. Releases

The brief lists ~18 systems. They ship in three working, tested releases so that nothing is half-built.

### v1: Core (this build)
| Area | Included |
|---|---|
| Design system | Tokens, light / dark / system themes, components, motion, focus, reduced motion |
| Smart Capture | Region drag, adjust handles, cancel, full-screen, capture from the panel button with per-site permission prompt, paste/drop image, PDF viewer fallback (crop in panel) |
| OCR | Offline Tesseract (English built in; 100+ languages downloadable, incl. Sinhala, Tamil, Hindi, Arabic, CJK), QR codes |
| Content detection | Rules-first classifier with a *specific description* (e.g. "Python error: missing module `pandas`"), AI refinement when available |
| Contextual actions | Per-category action sets: primary + secondary + More; configurable order |
| Library | Every capture saved with structured metadata; temporary vs kept; pins; notes; source link |
| Search | Local full-text index: OCR text, notes, titles, site, category, dates; typo-tolerant; reason-for-match shown |
| Video capture | Video URL, title and exact timestamp; resume link (YouTube and HTML5 video) |
| AI Model Hub | Ollama, LM Studio, Chrome built-in AI, OpenAI-compatible, Gemini, Anthropic; connection status, model list, Test, vision/text capability detection, task-level model choice |
| AI modes | Auto (router picks), Manual, Private (local only) |
| AI routing | Rule table (see architecture.md), "why this model" detail on demand |
| AI profiles | Study, Developer, Research, Writing, Private (editable prompts and models) |
| Privacy Shield | Detect emails, phones, ID numbers, API keys/tokens, card-like numbers; review; redact/blur; safe copy for sharing |
| Export | Copy text / Markdown / CSV, download image, download CSV |
| States | Loading, empty, error, offline, AI unavailable, local model disconnected, permission, storage full |
| Onboarding | 3 steps: pin, first capture, optional AI |

### v2: Intelligence
Visual Memory (automatic connections, related captures, topics), Multi-Capture Workspace (compare, combine, contradictions, comparison tables), Workspaces and projects, Study notebooks (notes, flashcards, quizzes, progress, learning-gap suggestions clearly labelled as AI), semantic search (local embeddings via Ollama or in-browser model).

### v3: Watch
Capture & Compare (baseline vs new, meaningful-change categories), Website Monitoring (text of a chosen page area, fetched on a schedule), smart cleanup (duplicates, similar, old temporary), storage dashboard, backup / import.

v1 data structures already include the v2/v3 fields (topics, workspace, relations, embeddings slot) so later releases need no migration.

## 4. Information architecture

Surfaces:

| Surface | Purpose |
|---|---|
| **Side panel** (main) | Capture home, capture result, Library, quick search |
| **Capture overlay** | Frozen screen, selection, three controls: Capture, Full screen, Cancel |
| **Workspace tab** (full page) | Library at full width, capture details, settings, AI Model Hub. v2 adds Workspaces, Study, Compare; v3 Monitor |
| **Toolbar popup** | None. The icon opens the side panel (fewer surfaces, one mental model) |

Side panel navigation (bottom bar, 3 items): **Capture · Library · Ask**. Settings and the full workspace open from the header. Secondary areas (Study, Workspaces, Monitor) live in the full workspace tab so the panel stays simple.

## 5. Key flows

**Capture**
1. Alt+Shift+E, the right-click menu, or the panel's Capture button.
2. If Chrome hasn't given Eidetic this page yet, the panel asks for that site when it can, or shows the two ways in, in place (no dead-end error; see decision D4).
3. Screen freezes; drag a box; adjust with handles; Enter captures, Esc cancels, F takes the full screen.
4. Panel shows the image, a one-line description ("Lecture slide: Decision trees, information gain"), the primary action, two secondary actions, More.
5. The capture is saved as *temporary* (7 days) unless the user keeps, pins, notes or acts on it.

**Search**: type in Library; results show preview, description, site, date and the reason it matched ("matched 'useEffect' in text").

**Connect AI**: Settings › AI › Add provider › Ollama is detected automatically on `localhost:11434` (LM Studio `localhost:1234`); pick a model, Test, done. Cloud providers ask for the user's key and show which address it will be sent to.

## 6. Content categories and their actions (v1)

| Category | Primary | Secondary | More |
|---|---|---|---|
| Programming error | Explain & fix* | Copy error · Search web | Corrected code* · Ask* |
| Code | Copy code | Explain* · Find bugs* | Convert language* · Download |
| Lecture slide / text | Explain simply* | Copy text · Notes* | Flashcards* · Quiz* · Translate* |
| Question / exercise | Solve step by step* | Copy · Hint* | Similar question* |
| Equation | Copy LaTeX | Solve* · Explain variables* | Related concepts* |
| Table | Copy for Excel | Download CSV · Copy Markdown | Summarise* · Analyse* |
| Chart | Describe* | Extract numbers* | Copy text |
| Event poster | Add to calendar | Copy details · Open link | Translate* |
| Contact | Copy contact (vCard) | Email · Call | — |
| QR / URL | Open link | Copy link | Check link safety (shows the real domain) |
| Product | Extract specs | Save for comparison (v2) | Missing info* |
| Job advertisement | Extract requirements | Skills checklist* | Compare with my profile* |
| Receipt | Copy items as table | Total | Download CSV |
| Research content | Summarise* | Findings* · Method* | Limitations* |
| UI / design screenshot | Describe* | Copy text | Accessibility notes* |
| Plain text (fallback) | Copy text | Explain* · Translate* | Read aloud · Search web |

`*` needs AI. When no AI is available the next local action moves up, and AI actions show "Connect AI" instead of failing.

## 7. Non-goals for v1
No accounts, no cloud sync, no server, no analytics, no automatic code execution, no reading of pages the user did not capture.
