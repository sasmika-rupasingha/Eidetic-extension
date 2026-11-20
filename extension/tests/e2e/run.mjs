// End-to-end: loads the built extension into real Chromium and drives it against a local test site, a mock Ollama
// and a mock "cloud" provider: capture → offline OCR → detection → contextual actions → streamed AI answers,
// automatic local refinement, follow-ups, routing, Private mode, privacy findings, video timestamps, the PDF
// fallback, library search, the workspace settings, theme switching and the per-site access help.
//   npm run e2e                    (first: npx playwright install chromium; or set CHROME_PATH)
//   npm run e2e -- --screenshots   (also writes screenshots to ../shots)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServers } from './server.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const shots = process.argv.includes('--screenshots') ? join(root, '..', 'shots') : null;
if (shots) mkdirSync(shots, { recursive: true });
const PORT = 19_000 + Math.floor(Math.random() * 500);
const SITE = `http://127.0.0.1:${PORT}`;

// A short test video (if ffmpeg is installed) for the video-moment check.
const videoPath = join(tmpdir(), 'eidetic-lecture.webm');
if (!existsSync(videoPath)) {
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10', '-t', '60', '-c:v', 'libvpx', '-b:v', '300k', '-y', videoPath]);
  } catch {
    /* no ffmpeg: the video check is skipped */
  }
}

execFileSync('node', ['scripts/build.mjs', '--e2e'], { cwd: root, stdio: 'inherit' });
const server = startServers(PORT, videoPath);

const launch = (ext) =>
  chromium.launchPersistentContext('', {
    channel: process.env.CHROME_PATH ? undefined : 'chromium',
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: shots ? 2 : 1,
  });

const ctx = await launch(join(root, 'dist', 'e2e'));
const jsErrors = [];
const watch = (p) => {
  const mine = () => p.url().startsWith('chrome-extension://');
  p.on('pageerror', (e) => mine() && jsErrors.push(`${p.url()}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && mine() && !/Failed to load resource|net::ERR/.test(m.text()) && jsErrors.push(`${p.url()}: ${m.text()}`));
};
ctx.on('page', watch);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};
const section = (t) => console.log(t);
const until = async (fn, ms = 60_000, every = 250) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, every));
  }
};

try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const base = `chrome-extension://${id}`;

  const control = await ctx.newPage();
  await control.goto(`${base}/workspace.html#/library`);
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings = {} } = await chrome.storage.local.get('settings');
      const next = { ...settings, ...p, providers: { ...settings.providers, ...p.providers } };
      await chrome.storage.local.set({ settings: next });
    }, patch);

  const site = await ctx.newPage();
  await site.goto(`${SITE}/error`);
  await site.bringToFront();

  // The side panel, opened as its own small window (headless browsers have no side panel UI).
  const [panel] = await Promise.all([ctx.waitForEvent('page'), control.evaluate((u) => chrome.windows.create({ url: u, type: 'popup', width: 420, height: 900 }), `${base}/panel.html`)]);
  await panel.waitForLoadState();
  await panel.setViewportSize({ width: 400, height: 900 });
  await site.bringToFront();

  const capture = async (selector = '#target') => {
    await panel.click('[data-testid=capture]');
    await site.waitForSelector('#eidetic-capture-host', { state: 'attached', timeout: 15_000 });
    const box = await site.locator(selector).boundingBox();
    await site.mouse.move(box.x - 6, box.y - 6);
    await site.mouse.down();
    await site.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await site.mouse.move(box.x + box.width + 6, box.y + box.height + 6, { steps: 4 });
    await site.mouse.up();
    await site.keyboard.press('Enter');
  };
  const resultLabel = (re) => until(async () => {
    const t = await panel.locator('[data-testid=result-label]').textContent({ timeout: 500 });
    return re.test(t ?? '') ? t : null;
  }, 90_000);

  section('First run and capture without AI');
  check('shows the 3-step welcome on first run', (await panel.getByText('Welcome to Eidetic').count()) === 1);
  await panel.getByRole('button', { name: 'Got it' }).click();
  check('the welcome closes and stays closed', await until(async () => (await panel.getByText('Welcome to Eidetic').count()) === 0, 5000));
  check('says that no AI is connected', /No AI connected/.test((await panel.locator('[data-testid=ai-status]').textContent()) ?? ''));
  await capture();
  check('the overlay closes after capturing', await until(async () => (await site.locator('#eidetic-capture-host').count()) === 0, 5000));
  const label = await resultLabel(/Programming error/);
  check('detects a Python error offline', label === 'Programming error · Python', label ?? 'no label');
  const title = await panel.locator('[data-testid=result-title]').textContent();
  check('describes it specifically', /pandas/.test(title ?? '') && /isn’t installed/.test(title ?? ''), title ?? '');
  check('says no AI was used', /no AI used/.test((await panel.locator('[data-testid=result-by]').textContent()) ?? ''));
  check('without AI, a local action becomes the primary one', (await panel.locator('[data-testid=primary-action]').textContent())?.includes('Copy error'));
  await panel.click('[data-testid=text-toggle]');
  const ocr = await panel.locator('[data-testid=ocr-text]').textContent();
  check('reads the text offline', /ModuleNotFoundError/.test(ocr ?? '') && /pandas/.test(ocr ?? ''), ocr ?? '');
  check('shows the catalogue number and temporary status', /№ 0001 · Temporary/.test((await panel.locator('.result-foot').textContent()) ?? ''));
  check('says which language the text was read in', /Read in English\./.test((await panel.locator('[data-testid=reread]').textContent()) ?? ''));
  await panel.selectOption('select[id^=reread-]', 'eng');
  const rereading = await until(async () => ((await panel.getByText('Reading the text on this computer').count()) ? true : null), 5000, 50);
  const reread = await until(async () => {
    const t = await panel.locator('[data-testid=ocr-text]').textContent({ timeout: 500 });
    return /ModuleNotFoundError/.test(t ?? '') && (await panel.locator('select[id^=reread-]:not([disabled])').count()) ? t : null;
  }, 90_000);
  check('reads a capture again in the language chosen for it', Boolean(rereading) && Boolean(reread) && (await resultLabel(/Programming error/)) !== null);
  if (shots) await panel.screenshot({ path: join(shots, 'panel-result-noai-light.png') });

  section('Connecting a local model (mock Ollama)');
  await setSettings({ providers: { ollama: { enabled: true, apiKey: '', baseUrl: SITE, models: [], defaultModel: '' } } });
  const status = await until(async () => {
    const t = await panel.locator('[data-testid=ai-status]').textContent();
    return /Local AI ready/.test(t ?? '') ? t : null;
  }, 20_000);
  check('the panel sees the local model', Boolean(status), (await panel.locator('[data-testid=ai-status]').textContent()) ?? '');
  const primary = await until(async () => {
    const t = await panel.locator('[data-testid=primary-action]').textContent();
    return /Explain & fix/.test(t ?? '') ? t : null;
  }, 10_000);
  check('with AI, “Explain & fix” becomes the primary action, marked local', /local/.test(primary ?? ''), primary ?? '');
  check('says the answer stays on this computer', /Nothing leaves this computer/.test((await panel.locator('[data-testid=route-line]').textContent()) ?? ''));
  await panel.click('[data-testid=primary-action]');
  const answer = await until(async () => {
    const t = await panel.locator('[data-testid=answer]').textContent();
    return /python -m pip install pandas/.test(t ?? '') && (await panel.locator('[data-testid=answer][aria-busy=false]').count()) ? t : null;
  }, 20_000);
  check('streams the answer from the local model', Boolean(answer));
  const fixReq = server.requests.filter((r) => r.via === 'ollama').at(-1);
  const sent = JSON.stringify(fixReq?.body?.messages ?? '');
  check('sends the captured text inside <content> tags', /<content>[\s\S]*ModuleNotFoundError/.test(sent));
  check('routes code work to the strongest local model', fixReq?.model === 'qwen2.5:7b', fixReq?.model);
  await panel.fill(`input[id^=ask-]`, 'Which version of pip?');
  await panel.keyboard.press('Enter');
  const follow = await until(async () => ((await panel.locator('[data-testid=answer]').textContent())?.includes('pip 24') ? true : null), 20_000);
  check('answers a follow-up in the same conversation', Boolean(follow));
  const fu = server.requests.filter((r) => r.via === 'ollama').at(-1);
  check('the follow-up includes the earlier answer', (fu?.body?.messages?.length ?? 0) >= 4 && JSON.stringify(fu.body.messages).includes('pip install pandas'));
  check('acting on a capture keeps it', /Kept/.test((await panel.locator('.result-foot').textContent()) ?? ''));
  if (shots) await panel.screenshot({ path: join(shots, 'panel-result-light.png'), fullPage: true });

  section('Other kinds of capture');
  await site.goto(`${SITE}/table`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await capture();
  const tlabel = await resultLabel(/Table/);
  check('detects a table with its size', tlabel === 'Table · 4 × 3', tlabel ?? '');
  check('offers “Copy for Excel” first', (await panel.locator('[data-testid=primary-action]').textContent())?.includes('Copy for Excel'));
  const refined = await until(async () => server.requests.some((r) => JSON.stringify(r.body).includes('Return JSON only')), 20_000);
  check('refines new captures automatically with the local model only', Boolean(refined) && server.requests.filter((r) => JSON.stringify(r.body).includes('Return JSON only')).every((r) => r.via === 'ollama'));

  await site.goto(`${SITE}/event`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await capture();
  const elabel = await resultLabel(/Event/);
  check('detects an event poster', Boolean(elabel));
  const etitle = `${await panel.locator('[data-testid=result-title]').textContent()} ${await panel.locator('[data-testid=result-by]').textContent()}`;
  check('reads its date and time', /2026-12-12/.test(etitle ?? '') && /09:30/.test(etitle ?? ''), etitle ?? '');
  check('offers “Add to calendar” first', (await panel.locator('[data-testid=primary-action]').textContent())?.includes('Add to calendar'));

  await site.goto(`${SITE}/private`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await capture();
  const priv = await until(async () => panel.locator('[data-testid=privacy]').textContent({ timeout: 500 }), 90_000);
  check('Privacy Shield finds the email and the API key', /email address/.test(priv ?? '') && /API key/.test(priv ?? ''), priv ?? '');

  if (existsSync(videoPath)) {
    await site.goto(`${SITE}/video`);
    await site.evaluate(() => new Promise((r) => {
      const v = document.querySelector('video');
      const go = () => {
        v.currentTime = 38;
        v.addEventListener('seeked', () => r(), { once: true });
      };
      if (v.readyState >= 1) go();
      else v.addEventListener('loadedmetadata', go, { once: true });
    }));
    await site.bringToFront();
    await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
    await capture();
    const vline = await until(async () => panel.locator('[data-testid=video-line]').textContent({ timeout: 500 }), 60_000);
    check('keeps the video moment', /Video at 0:38/.test(vline ?? ''), vline ?? '');
    check('doesn’t invent a resume link where the site has none', /Open the video page/.test(vline ?? ''), vline ?? '');
  } else console.log('  - video check skipped (no ffmpeg)');

  section('Chrome’s PDF viewer');
  await site.goto(`${SITE}/scan.pdf`);
  await site.waitForTimeout(1500);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await panel.click('[data-testid=capture]');
  // Newer Chrome lets the overlay run on its PDF viewer; older versions refuse it and the panel offers cropping instead.
  const way = await until(async () => ((await site.locator('#eidetic-capture-host').count()) ? 'overlay' : (await panel.getByText('Use the whole screen').count()) ? 'panel' : null), 20_000);
  check('can capture from a PDF (overlay on the page, or choosing the area in the panel)', Boolean(way), 'neither appeared');
  if (way === 'overlay') {
    await site.mouse.move(40, 40);
    await site.mouse.down();
    await site.mouse.move(900, 500, { steps: 6 });
    await site.mouse.up();
    await site.keyboard.press('Enter');
  } else if (way === 'panel') await panel.getByText('Use the whole screen').click();
  if (way) {
    // Wait for the new capture (not the previous result still on screen) and open its text.
    const pdfText = await until(async () => {
      const toggle = panel.locator('[data-testid=text-toggle]');
      if (!(await toggle.count())) return null;
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      const t = await panel.locator('[data-testid=ocr-text]').textContent({ timeout: 500 });
      return /SCANNED NOTICE/i.test(t ?? '') ? t : null;
    }, 90_000);
    check(`reads the PDF page (${way})`, Boolean(pdfText), (await panel.locator('[data-testid=ocr-text]').textContent().catch(() => '')) ?? '');
  }

  section('Routing and Private mode');
  await setSettings({ providers: { gemini: { enabled: true, apiKey: 'test-key', baseUrl: `${SITE}/gemini`, models: [], defaultModel: 'gemini-test' } } });
  await site.goto(`${SITE}/table`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await capture();
  await resultLabel(/Table/);
  await panel.waitForTimeout(1500);
  await panel.getByRole('button', { name: 'More' }).click();
  await panel.getByRole('menuitem', { name: /Analyse/ }).click();
  const cloudLine = await until(async () => ((await panel.locator('[data-testid=answer]').textContent())?.includes('Here is the answer') ? true : null), 20_000);
  check('in Auto, reasoning goes to the strongest model (the cloud one)', Boolean(cloudLine) && server.requests.at(-1)?.via === 'gemini', server.requests.at(-1)?.via);
  await setSettings({ mode: 'private' });
  await panel.waitForTimeout(800);
  const before = server.requests.filter((r) => r.via === 'gemini').length;
  await panel.getByRole('button', { name: 'More' }).click();
  await panel.getByRole('menuitem', { name: /Analyse/ }).click();
  await until(async () => ((await panel.locator('[data-testid=answer][aria-busy=false]').count()) ? true : null), 20_000);
  check('in Private mode, the same action stays on this computer', server.requests.filter((r) => r.via === 'gemini').length === before && server.requests.at(-1)?.via === 'ollama');
  check('the panel shows Private mode', /Private/.test((await panel.locator('.mode-chip').textContent()) ?? ''));

  section('Your own answer style');
  const styleWs = await ctx.newPage();
  await styleWs.goto(`${base}/workspace.html#/settings/ai`);
  const STYLE = 'Answer like a patient tutor with one short example.';
  await styleWs.fill('#profile-style', STYLE);
  await styleWs.getByRole('button', { name: 'Save style' }).click();
  const stored = await until(async () => (await control.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.profileStyles?.general)) === STYLE, 5000);
  check('saves the edited style for the chosen profile', Boolean(stored));
  await site.bringToFront();
  const beforeStyle = server.requests.length;
  await panel.getByRole('button', { name: 'More' }).click();
  await panel.getByRole('menuitem', { name: /Analyse/ }).click();
  const styled = await until(async () => server.requests.slice(beforeStyle).find((r) => r.via === 'ollama' && JSON.stringify(r.body).includes(STYLE)), 20_000);
  check('sends the user’s style to the model, with the untrusted-content rule still in place', Boolean(styled) && JSON.stringify(styled.body).includes('untrusted'));
  await until(async () => ((await panel.locator('[data-testid=answer][aria-busy=false]').count()) ? true : null), 20_000);
  await styleWs.getByRole('button', { name: 'Reset to default' }).click();
  const cleared = await until(async () => (await control.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.profileStyles?.general)) === undefined, 5000);
  const shownAfterReset = await until(async () => {
    const v = await styleWs.inputValue('#profile-style');
    return v && v !== STYLE ? v : null;
  }, 5000);
  check('Reset to default goes back to the built-in style', Boolean(cleared) && Boolean(shownAfterReset), `stored cleared: ${Boolean(cleared)}, box: ${await styleWs.inputValue('#profile-style')}`);
  await styleWs.close();
  await setSettings({ mode: 'auto' });

  section('A page Chrome never lets extensions capture');
  const browserPage = await ctx.newPage();
  await browserPage.goto('chrome://version').catch(() => undefined);
  await browserPage.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).click();
  await panel.click('[data-testid=capture]');
  const reason = await until(async () => panel.locator('[data-testid=access-help]').getAttribute('data-reason', { timeout: 500 }), 10_000);
  check('with access to all sites, says it’s a browser page instead of asking for access again', reason === 'browser-page', String(reason));
  check('and shows no “Couldn’t capture” error as well', (await panel.locator('[data-testid=capture-error]').count()) === 0);
  await browserPage.close();
  await site.bringToFront();

  section('Library search');
  await panel.getByRole('button', { name: 'Library', exact: true }).click();
  await panel.fill('#lib-q', 'pandsa');
  const hit = await until(async () => {
    const t = await panel.locator('.entry').first().textContent({ timeout: 500 });
    return /pandas/i.test(t ?? '') && /In the/.test(t ?? '') && (await panel.locator('.entry').count()) === 1 ? t : null;
  }, 5000);
  check('finds a capture despite a typo, and says why', Boolean(hit), (await panel.locator('.entry').allTextContents()).join(' | '));
  await panel.fill('#lib-q', '');
  await panel.getByRole('button', { name: 'Tables' }).click();
  const tables = await panel.locator('.entry').count();
  check('filters by kind', tables === 2, String(tables));
  if (shots) await panel.screenshot({ path: join(shots, 'panel-library-light.png') });

  section('Workspace and themes');
  const ws = await ctx.newPage();
  await ws.goto(`${base}/workspace.html#/settings/ai`);
  const conn = await until(async () => ((await ws.getByText('Connected · 2 models').count()) ? true : null), 15_000);
  check('AI models shows Ollama connected with 2 models', Boolean(conn));
  check('detects which model can see images', (await ws.locator('tr', { hasText: 'llava:7b' }).getByText('Vision', { exact: true }).count()) === 1);
  check('reads the context size from Ollama', (await ws.locator('tr', { hasText: 'qwen2.5:7b' }).getByText('32K').count()) === 1);
  check('explains who handles each task', (await ws.getByText('The only ready model that can see images').count()) + (await ws.getByText(/can see images and runs on this computer/).count()) > 0);
  await ws.locator('tr', { hasText: 'llava:7b' }).getByRole('button', { name: 'Test' }).click();
  check('Test button checks a model', Boolean(await until(async () => ((await ws.getByText(/Works · /).count()) ? true : null), 10_000)));
  if (shots) await ws.screenshot({ path: join(shots, 'workspace-ai-light.png'), fullPage: true });
  await ws.goto(`${base}/workspace.html#/settings/appearance`);
  await ws.getByRole('radio', { name: /Dark/ }).click();
  const dark = await until(async () => (await panel.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 5000);
  check('switching to dark applies everywhere at once', Boolean(dark) && (await ws.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await ws.reload();
  check('the theme is remembered', (await ws.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  if (shots) {
    await ws.goto(`${base}/workspace.html#/settings/ai`);
    await ws.waitForTimeout(800);
    await ws.screenshot({ path: join(shots, 'workspace-ai-dark.png'), fullPage: true });
    await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
    await panel.waitForTimeout(500);
    await panel.screenshot({ path: join(shots, 'panel-home-dark.png') });
    await panel.locator('.entry .linkish').first().click();
    await panel.waitForTimeout(800);
    await panel.screenshot({ path: join(shots, 'panel-result-dark.png') });
    await panel.getByRole('button', { name: 'Library', exact: true }).click();
    await panel.waitForTimeout(400);
    await panel.screenshot({ path: join(shots, 'panel-library-dark.png') });
    await ws.goto(`${base}/workspace.html#/library`);
    await ws.waitForTimeout(600);
    await ws.screenshot({ path: join(shots, 'workspace-library-dark.png') });
  }
  await ws.getByRole('radio', { name: /Light/ }).click().catch(() => undefined);

  section('Extension pages');
  check('no JavaScript errors on extension pages', jsErrors.length === 0, jsErrors.join(' | '));
} catch (e) {
  console.error(e);
  failures += 1;
} finally {
  await ctx.close();
}

// A second browser with the store build: no access to any site until the user allows it.
section('First capture on a site with no access yet (store build)');
const ctx2 = await launch(join(root, 'dist', 'chromium'));
try {
  const sw = ctx2.serviceWorkers()[0] ?? (await ctx2.waitForEvent('serviceworker'));
  const base = `chrome-extension://${new URL(sw.url()).host}`;
  const control = await ctx2.newPage();
  await control.goto(`${base}/workspace.html`);
  const site = await ctx2.newPage();
  await site.goto(`${SITE}/error`);
  await site.bringToFront();
  const [panel] = await Promise.all([ctx2.waitForEvent('page'), control.evaluate((u) => chrome.windows.create({ url: u, type: 'popup', width: 420, height: 900 }), `${base}/panel.html`)]);
  await panel.waitForLoadState();
  await site.bringToFront();
  await panel.click('[data-testid=capture]');
  const help = await until(async () => panel.locator('[data-testid=access-help]').textContent({ timeout: 500 }), 10_000);
  check('explains the two ways to allow capture instead of a dead end', /Alt/.test(help ?? '') && /Allow on all sites/.test(help ?? ''), help ?? '');
  await panel.waitForTimeout(500);
  check('shows one message, not also a “Couldn’t capture” error', (await panel.locator('[data-testid=capture-error]').count()) === 0);
} catch (e) {
  console.error(e);
  failures += 1;
} finally {
  await ctx2.close();
  server.close();
}

console.log(failures ? `\n${failures} end-to-end check(s) failed` : '\nall end-to-end checks passed');
process.exit(failures ? 1 : 0);
