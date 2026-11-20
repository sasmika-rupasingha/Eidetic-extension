# Eidetic: architecture

Manifest V3 · TypeScript (strict) · React 19 · Vite · Vitest · Playwright. No backend.

## 1. Modules

Each module has one job, a small public interface (`index.ts`) and its own tests. UI never talks to storage or AI directly; it calls module functions.

```
extension/src/
  background/      service worker: shortcuts, context menu, opens panel, (v3) alarms
  capture/         tab screenshot, overlay injection, crop, video timestamp, permission request
  content/         functions injected into pages (overlay, video probe). Self-contained by design
  ocr/             Tesseract worker pool, language packs, QR. No AI dependency
  detect/          rules-first content classifier + extractors (table, entities, code, math, error, event…)
  actions/         action registry: one file per action, each declares category, needsAi, run()
  ai/
    providers/     ollama, lmstudio, builtin (Chrome), openai-compatible, gemini, anthropic
    hub.ts         provider registry, connection status, model list, capabilities
    router.ts      picks provider+model per task, mode (auto/manual/private), explains why
    profiles.ts    Study / Developer / Research / Writing / Private
    prompts/       one prompt per task; untrusted text always wrapped in <content> tags
  privacy/         sensitive-data detectors, redaction, safe export
  store/           IndexedDB (captures, blobs, index), settings, quotas, temporary expiry
  search/          local word index + typo-tolerant matching with match reasons; (v2) embeddings
  export/          clipboard, CSV, Markdown, vCard, ICS, image download
  ui/
    design/        tokens.css, themes, primitives (Button, Field, Menu, Dialog, Tooltip, Toast…)
    panel/         side panel: Capture, Result, Library, Ask
    workspace/     full-page tab: Library, Details, Settings, AI Hub; (v2) Workspaces, Study
    overlay/       capture overlay styles (shadow DOM)
```

Reused from Lumen (tested, adapted to the new interfaces): OCR wrapper and worker reuse, QR reader, snip overlay mechanics, table detection and CSV safety, link/phone/date extraction, AI provider request builders and SSE streaming, built-in AI wrapper, safe Markdown renderer, HTML-free rendering of AI output.

## 2. Data model (IndexedDB `eidetic`, version 1)

```ts
interface Capture {
  id: string;                    // ulid
  createdAt: number;
  status: 'temporary' | 'kept';  // temporary expires after settings.tempDays (default 7)
  pinned: boolean;
  source: { url: string; title: string; site: string; favicon?: string };
  video?: { url: string; title: string; time: number; resumeUrl: string };
  image: { blobId: string; w: number; h: number; bytes: number; thumbId: string };
  ocr?: { text: string; lang: string; words: Word[]; confidence: number };
  detection: {
    category: Category;          // e.g. 'error', 'table', 'slide', 'event'…
    description: string;         // specific one-liner, rules first, AI refined
    confidence: number;
    by: 'rules' | 'ai';
    entities: Entity[];          // urls, emails, phones, dates, money, ids…
    table?: string[][];
    code?: { language: string; text: string };
    math?: { latex: string };
  };
  privacy: { findings: PrivacyFinding[]; redactedBlobId?: string };
  notes: string;
  ai: { summary?: string; keywords?: string[]; topics?: string[]; model?: string };
  // v2 fields, present from v1 so no migration is needed
  workspaceId?: string;
  relations: { id: string; reason: string; by: 'rules' | 'ai' | 'user'; removed?: boolean }[];
  embedding?: { model: string; vector: Float32Array };
  hash: string;                  // perceptual hash for duplicate / similar detection (v3 cleanup)
}
```

Stores: `captures` (metadata, with a 320 px JPEG thumbnail inline for fast lists), `blobs` (the full image, PNG for best OCR), `meta` (catalogue counter). Settings and API keys live in `chrome.storage.local` (never synced, never logged). Search builds its index in memory from the stored text (a persistent index arrives with v2).

## 3. Capture pipeline

```
trigger (shortcut / menu / panel button / paste)
  → access (activeTab from the icon, shortcut or menu; an allowed site; otherwise the panel explains how)
  → captureVisibleTab → overlay (shadow DOM, frozen image, handles) → rect
  → crop (OffscreenCanvas, device pixels) → video probe (currentTime, title) if a <video> is under the box
  → save temporary capture (image + thumb)            ← panel shows it immediately
  → OCR (worker)  → detect (rules)  → privacy scan     ← each step updates the panel
  → index for search
  → [AI available and allowed] refine description, keywords, topics
```
Every step after "save" is resumable: OCR runs in the panel or workspace (it needs a page with a worker), so a capture taken while neither is open is read the next time it is shown. Changes reach every open Eidetic page through a BroadcastChannel plus same-page listeners.

## 4. Detection (rules first)

Order: QR → table (word-grid geometry) → code (symbol density, indentation, keywords) → error (stack-trace and error patterns per language: Python, JS/TS, Java, C#, PHP, SQL, npm/pip) → math (operator density, LaTeX-like tokens) → event (date + time + place/venue words) → contact → receipt (prices + total) → job ad (responsibilities / requirements vocabulary) → product (spec key:value lines, price) → research (abstract / method / results vocabulary, citations) → slide (title + bullets layout) → text.

Each detector returns `{category, confidence, description, extracted}`; the best score wins, ties go to the more specific category. The description is built from extracted facts, e.g. `Python error: ModuleNotFoundError: No module named 'pandas'`.

## 5. AI layer

**Provider interface**
```ts
interface Provider {
  id: string; kind: 'local' | 'cloud' | 'builtin';
  status(): Promise<'ready' | 'offline' | 'needs-setup' | 'unsupported'>;
  models(): Promise<ModelInfo[]>;            // with capabilities: vision, code, contextTokens
  chat(req: ChatRequest, opts: StreamOptions): Promise<string>;
}
```
Capabilities: Ollama `/api/show` (capabilities list), LM Studio `/api/v0/models` (type `vlm`), cloud catalogs; unknown → name heuristics, then verified on first use (a model that rejects images is marked text-only and retried with OCR text).

**Router**: `route(task, capture) → {provider, model, reason}`

| Task | Route |
|---|---|
| OCR, QR, dates, URLs, tables, basic category, privacy | Local code, never AI |
| Short summary, flashcards, keywords | Lightest ready model (built-in → small local → cloud) |
| Translate | Built-in Translator API → local → cloud |
| Code / error | Model tagged code-capable, else strongest |
| Solve, research, multi-capture | Strongest ready model |
| Image understanding (chart, UI) | Vision model; none → OCR text to text model, with a note |
| Any task in Private mode | Local and built-in only; cloud is never called |

Manual mode uses the user's choice per task. "Why this model?" shows the reason string.

## 6. Security and privacy
- Permissions: `activeTab`, `scripting`, `storage`, `unlimitedStorage`, `contextMenus`, `sidePanel`, `offscreen` (OCR worker if needed). Optional: per-origin hosts, provider hosts (requested when added), `notifications` and `alarms` (v3).
- CSP `script-src 'self' 'wasm-unsafe-eval'; object-src 'none'`. No remote code.
- Page and OCR text are untrusted: never rendered as HTML, sent to models inside `<content>` tags with an instruction to treat it as data.
- Cloud calls show a "Sending to <provider>" chip; Private mode blocks them at the router *and* at the provider layer.
- Keys never leave `chrome.storage.local` except to their own provider host.

## 7. Performance
OCR worker reused and closed after idle; images stored as WebP; thumbnails for lists; virtualised lists; search index updated incrementally; AI refinement cached per capture hash.

## 8. Testing
Unit (Vitest + jsdom): detectors with real-world fixtures, router decisions, privacy detectors, store, search, every provider's request format. End-to-end (Playwright, real Chromium): capture from shortcut and from panel button, OCR, each category's primary action, library search, private mode blocks cloud, theme switching, both themes visually reviewed.
