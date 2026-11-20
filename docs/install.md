# Installing and running Eidetic (Windows)

## 1. Tools

```powershell
winget install OpenJS.NodeJS.LTS     # Node 22 (builds the extension)
winget install Git.Git
winget install Google.Chrome         # needed for Chrome's free built-in AI
```

Open a new PowerShell window afterwards.

## 2. Build

```powershell
cd C:\Projects\eidetic\extension
npm ci          # once: installs the exact versions in package-lock.json
npm run build   # -> dist\chromium and dist\firefox
# npm run package  # also makes the zips to upload to the stores
```

## 3. Load it

**Chrome, Edge, Brave, Opera, Vivaldi, Arc:** open `chrome://extensions`, turn on **Developer mode**, **Load unpacked** › `C:\Projects\eidetic\extension\dist\chromium`. Pin Eidetic (puzzle-piece icon › pin).

**Firefox 140+:** `about:debugging#/runtime/this-firefox` › **Load Temporary Add-on…** › `extension\dist\firefox\manifest.json`.

After any code change: `npm run build`, then press the reload icon on Eidetic's card and refresh the page you test on.

| Shortcut | Does |
|---|---|
| Alt+Shift+E | Capture an area |
| Alt+Shift+M | Open Eidetic |

Change them at `chrome://extensions/shortcuts`.

**First capture on a site:** Chrome only shows a page to an extension after you click its toolbar icon on that page, use the shortcut or the right-click menu. If you press the panel's Capture button on a page Eidetic can't see yet, the panel tells you the two ways in (shortcut on the page, or Allow on all sites). If Eidetic is already allowed on all sites and a page still can't be captured, the panel says why instead: Chrome never lets extensions capture the new tab page, `chrome://` pages or the Web Store; files opened from your computer (`file://`) also need **Allow access to file URLs** in Eidetic's details on `chrome://extensions`, and Chrome's site settings or an organisation policy can block extensions on a site.

## 4. Connect AI (optional)

Everything except explanations works without AI. Open the panel's settings icon › **AI models**.

### Ollama (free, on your computer)

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5:7b        # good general model (4.7 GB)
ollama pull llava:7b          # optional: a model that can see images
setx OLLAMA_ORIGINS "chrome-extension://*,moz-extension://*"
```

Quit Ollama from the system tray and start it again (so it reads `OLLAMA_ORIGINS`). In Eidetic: AI models › Ollama › **Connect**. Eidetic lists your models, detects which can see images and their context size, and **Test** checks each one.

### LM Studio (free, on your computer)

In LM Studio: download a model, open the **Developer** tab and **Start Server** (port 1234). In Eidetic: AI models › LM Studio › **Connect**. Vision models show as "Vision".

### Chrome built-in AI (free, on your computer)

Google Chrome 138+ on desktop, 22 GB free disk and a GPU with more than 4 GB memory (or 16 GB RAM). AI models › Chrome built-in AI › **Download** (about 4 GB, once). Check support at `chrome://on-device-internals`.

### Your own API key (cloud)

Gemini (free tier at aistudio.google.com/apikey), OpenAI, Anthropic, OpenRouter or any OpenAI-compatible server: **Add key** › paste › **Connect** › choose the model. Keys stay in this browser and go only to their own provider. A ChatGPT, Claude or Gemini subscription is not an API key.

### Modes

- **Auto:** quick work goes to the lightest ready model, code to a code model, solving and research to the strongest, images to a model that can see.
- **Manual:** choose the model for each kind of task in "Who handles each task".
- **Private:** only models on this computer, whatever you press.

## 5. Tests

```powershell
npm run typecheck; npm run lint; npm test
npx playwright install chromium     # once
npm run e2e                         # or with Edge: $env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; npm run e2e
                                    # (Google Chrome ignores --load-extension, so it can't run these tests; use Playwright's Chromium or Edge)
npm run lint:firefox
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| First `npm ci` stops with only "A complete log of this run…" | A locked file: close VS Code or a running build and run it again. |
| "Manifest file is missing or unreadable" | Load `extension\dist\chromium`, not `extension` or the project root. |
| Ollama: "Refused the extension" | Set `OLLAMA_ORIGINS` as above, then quit and restart Ollama. |
| Ollama / LM Studio: "Not running" | Start it (LM Studio: Developer tab › Start Server), then **Retry**. |
| "No models found" | `ollama pull qwen2.5:7b`, or load a model in LM Studio. |
| Capture does nothing on a page | Browser pages (`chrome://`, the Web Store) can't be captured. |
| Sinhala or Tamil reads badly | Settings › Capture and languages › tick the language, then capture a larger, sharper area. |
