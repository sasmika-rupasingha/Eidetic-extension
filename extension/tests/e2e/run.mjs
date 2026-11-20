// End-to-end: loads the built extension into real Chromium and drives it against a local test site, a mock Ollama
// and a mock "cloud" provider: capture → offline OCR → detection → contextual actions → streamed AI answers,
// automatic local refinement, follow-ups, routing, Private mode, privacy findings, video timestamps, the PDF
// fallback, library search, the workspace settings, theme switching and the per-site access help.
//   npm run e2e                    (first: npx playwright install chromium; or set CHROME_PATH)
//   npm run e2e -- --screenshots   (also writes screenshots to ../shots)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

  // Hiding an area the detector didn't find: drag over the top-left of the capture, download, check those pixels.
  await panel.click('[data-testid=hide-open]');
  const stageBox = await panel.locator('[data-testid=hide-stage]').boundingBox();
  await panel.mouse.move(stageBox.x + stageBox.width * 0.05, stageBox.y + stageBox.height * 0.05);
  await panel.mouse.down();
  await panel.mouse.move(stageBox.x + stageBox.width * 0.2, stageBox.y + stageBox.height * 0.2, { steps: 3 });
  await panel.mouse.move(stageBox.x + stageBox.width * 0.35, stageBox.y + stageBox.height * 0.35, { steps: 3 });
  await panel.mouse.up();
  const marked = await panel.getByRole('button', { name: 'Area 1', exact: true }).count();
  check('marks an area by dragging', marked === 1, `${marked} matching buttons`);
  const safePixel = async () => {
    const [dl] = await Promise.all([panel.waitForEvent('download'), panel.click('[data-testid=hide-download]')]);
    const b64 = readFileSync(await dl.path()).toString('base64');
    return control.evaluate(async (data) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return Array.from(ctx.getImageData(Math.round(bmp.width * 0.2), Math.round(bmp.height * 0.2), 1, 1).data.slice(0, 3));
    }, b64);
  };
  const hidden = await safePixel();
  await panel.getByRole('button', { name: 'Remove area 1' }).click();
  const shown = await safePixel(); // only the detected details now
  check('the safe image hides the marked area (and only because it was marked)', hidden.every((v) => v === 17) && !shown.every((v) => v === 17), `marked: ${hidden.join(',')} · unmarked: ${shown.join(',')}`);
  await panel.getByRole('button', { name: 'Done' }).click();

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

  section('Capture & Compare');
  await site.goto(`${SITE}/change`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await capture();
  const firstFees = await until(async () => {
    if (!(await panel.locator('select[id^=reread-]:not([disabled])').count())) return null;
    const t = await panel.locator('[data-testid=result-title]').textContent({ timeout: 500 });
    return t ? await panel.locator('.result-caption').textContent() : null;
  }, 90_000);
  await site.reload();
  await site.bringToFront();
  await panel.click('[data-testid=recapture]');
  await site.waitForSelector('#eidetic-capture-host', { state: 'attached', timeout: 15_000 });
  await site.waitForTimeout(300);
  await site.keyboard.press('Enter');
  const changeList = await until(async () => {
    const t = await panel.locator('[data-testid=change-list]').textContent({ timeout: 500 });
    return /1,350/.test(t ?? '') ? t : null;
  }, 90_000);
  check('Capture & Compare lists the changed number, old → new', /1,200\s*→\s*\$?1,350/.test(changeList ?? ''), changeList ?? (await panel.locator('[data-testid=changes]').textContent().catch(() => 'no changes section')) ?? '');
  check('and the added text', /Added[\s\S]*fee/i.test(changeList ?? ''), changeList ?? '');
  const secondCaption = await panel.locator('.result-caption').textContent();
  const sizeOf = (t) => /(\d+) × (\d+)/.exec(t ?? '')?.slice(1).map(Number) ?? [0, 0];
  const [w1, h1] = sizeOf(firstFees);
  const [w2, h2] = sizeOf(secondCaption);
  check('the new capture starts from the same area on the same page', w1 > 0 && Math.abs(w1 - w2) <= 2 && Math.abs(h1 - h2) <= 2 && w2 < 1100, `${firstFees} vs ${secondCaption}`);
  const imgChange = await until(async () => {
    const t = await panel.locator('[data-testid=image-change]').textContent({ timeout: 500 });
    return /% of the image changed/.test(t ?? '') ? t : null;
  }, 15_000);
  check('marks the image difference', Boolean(imgChange), (await panel.locator('[data-testid=image-change]').textContent().catch(() => '')) ?? '');

  section('Website monitoring');
  await site.goto(`${SITE}/monitor`);
  await site.bringToFront();
  await panel.getByRole('button', { name: 'Capture', exact: true }).first().click();
  await panel.click('[data-testid=watch]');
  await site.waitForSelector('#eidetic-pick-host', { state: 'attached', timeout: 15_000 });
  const fb = await site.locator('#fees').boundingBox();
  await site.mouse.move(fb.x + 6, fb.y + 6, { steps: 3 });
  await site.mouse.click(fb.x + 6, fb.y + 6);
  const mp = await ctx.newPage();
  await mp.goto(`${base}/workspace.html#/monitor`);
  const watched = await until(async () => {
    const t = await mp.locator('[data-testid=monitor-text]').textContent({ timeout: 500 });
    return /Tuition: \$1,200/.test(t ?? '') ? t : null;
  }, 15_000);
  check('watches the part of the page the user points at', Boolean(watched), (await mp.locator('main').textContent()) ?? '');
  await mp.getByRole('button', { name: 'Check now' }).click();
  const monChange = await until(async () => {
    const t = await mp.locator('[data-testid=monitor-change-line]').textContent({ timeout: 500 });
    return /number changed/.test(t ?? '') ? t : null;
  }, 20_000);
  const monList = (await mp.locator('[data-testid=monitor] [data-testid=change-list]').textContent().catch(() => '')) ?? '';
  check('a check downloads the page, reads the part (no scripts run) and lists the change', Boolean(monChange) && /1,200\s*→\s*\$1,350/.test(monList), `${monChange} | ${monList}`);
  const badge = await control.evaluate(() => chrome.action.getBadgeText({}));
  check('shows the change as a badge', badge === '1', badge);
  const badgeCleared = await until(async () => ((await control.evaluate(() => chrome.action.getBadgeText({}))) === '' ? true : null), 10_000);
  check('the badge clears once the Monitor page has been seen', Boolean(badgeCleared));
  await mp.close();

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

  section('Visual Memory');
  await panel.getByRole('button', { name: 'Library', exact: true }).click();
  await panel.getByRole('button', { name: 'Tables' }).click();
  await panel.locator('.entry .linkish').first().click();
  const relLine = await until(async () => {
    const t = await panel.locator('[data-testid=related]').textContent({ timeout: 500 });
    return /Same page/.test(t ?? '') ? t : null;
  }, 15_000);
  check('two captures of the same page show each other as related, with the reason', Boolean(relLine), relLine ?? 'no related section');
  const firstTitle = await panel.locator('.result-foot').textContent();
  await panel.locator('[data-testid=related] .related-item', { hasText: 'Same page' }).first().locator('.related-title').click();
  const back = await until(async () => {
    const t = await panel.locator('.result-foot').textContent({ timeout: 500 });
    const r = await panel.locator('[data-testid=related]').textContent({ timeout: 500 });
    return t !== firstTitle && /Same page/.test(r ?? '') ? true : null;
  }, 10_000);
  check('opening a related capture shows the link back', Boolean(back));
  const topicWs = await ctx.newPage();
  await topicWs.goto(`${base}/workspace.html#/library`);
  await topicWs.waitForSelector('#lib-topic', { timeout: 10_000 });
  await topicWs.selectOption('#lib-topic', 'events');
  const topicCount = await until(async () => {
    const t = await topicWs.locator('.lib-count').textContent();
    return /^1 capture(?!s)/.test(t ?? '') ? t : null;
  }, 5000);
  check('the library filters by topic', Boolean(topicCount), (await topicWs.locator('.lib-count').textContent()) ?? '');
  await topicWs.close();

  section('Library search');
  await panel.getByRole('button', { name: 'Library', exact: true }).click();
  await panel.getByRole('button', { name: 'All', exact: true }).click();
  await panel.fill('#lib-q', 'pandsa');
  const hit = await until(async () => {
    const t = await panel.locator('.entry').first().textContent({ timeout: 500 });
    return /pandas/i.test(t ?? '') && /In the/.test(t ?? '') && (await panel.locator('.entry').count()) === 1 ? t : null;
  }, 5000);
  check('finds a capture despite a typo, and says why', Boolean(hit), (await panel.locator('.entry').allTextContents()).join(' | '));
  await panel.fill('#lib-q', 'conference');
  const meaning = await until(async () => {
    const t = await panel.locator('[data-testid=meaning]').textContent({ timeout: 500 });
    return /Symposium/i.test(t ?? '') ? t : null;
  }, 30_000);
  check('finds a capture by meaning (local embedding model) when no word matches', Boolean(meaning) && server.requests.some((r) => r.via === 'ollama-embed' && r.model === 'nomic-embed-text:latest'), (await panel.locator('.library').textContent()) ?? '');
  await panel.fill('#lib-q', '');
  await panel.getByRole('button', { name: 'Tables' }).click();
  const tables = await panel.locator('.entry').count();
  check('filters by kind', tables === 2, String(tables));
  if (shots) await panel.screenshot({ path: join(shots, 'panel-library-light.png') });

  section('Workspaces');
  const wsp = await ctx.newPage();
  await wsp.goto(`${base}/workspace.html#/workspaces`);
  await wsp.fill('#ws-name', 'Machine learning');
  await wsp.getByRole('button', { name: 'Create workspace' }).click();
  check('creates a workspace', Boolean(await until(async () => ((await wsp.locator('.ws-card', { hasText: 'Machine learning' }).count()) ? true : null), 5000)));
  await wsp.goto(`${base}/workspace.html#/library`);
  await wsp.getByRole('button', { name: 'Tables' }).click();
  await wsp.getByRole('button', { name: 'Select all shown' }).click();
  await wsp.selectOption('[aria-label="Move the selected captures to a workspace"]', { label: 'Machine learning' });

  section('Compare and combine');
  await wsp.getByRole('button', { name: 'Compare', exact: true }).click();
  const cols = await until(async () => ((await wsp.locator('[data-testid=compare-col]').count()) === 2 ? true : null), 5000);
  check('opens 2 selected captures side by side', Boolean(cols));
  check('compares their text locally', /100% of the text is the same/.test((await wsp.locator('[data-testid=diff-summary]').textContent()) ?? ''), (await wsp.locator('[data-testid=diff-summary]').textContent()) ?? '');
  const mergedRows = await wsp.locator('[data-testid=merged-table] tbody tr').count();
  check('merges their tables into one comparison table', mergedRows === 6 && (await wsp.locator('[data-testid=merged-table] th').first().textContent()) === 'Source', String(mergedRows));
  check('says where the text of all captures goes before sending', /Sends the text of 2 captures to Google Gemini/.test((await wsp.locator('[data-testid=cmp-route]').textContent()) ?? ''), (await wsp.locator('[data-testid=cmp-route]').textContent()) ?? '');
  const beforeCmp = server.requests.length;
  await wsp.getByRole('button', { name: 'Build a comparison table' }).click();
  const cmpAnswer = await until(async () => ((await wsp.locator('[data-testid=multi-answer][aria-busy=false]').textContent({ timeout: 500 }))?.includes('it works') ? true : null), 20_000);
  const cmpReq = JSON.stringify(server.requests.slice(beforeCmp).at(-1)?.body ?? '');
  check('an AI action sees each capture in its own <content index> block', Boolean(cmpAnswer) && cmpReq.includes('<content index=\\"1\\">') && cmpReq.includes('<content index=\\"2\\">'), cmpReq.slice(0, 300));
  await wsp.goto(`${base}/workspace.html#/library`);
  await wsp.selectOption('#lib-ws', { label: 'Machine learning' });
  const wsCount = await until(async () => {
    const t = await wsp.locator('.lib-count').textContent();
    return (t ?? '').startsWith('2 captures') ? t : null;
  }, 5000);
  check('assigns captures in bulk and filters the library by workspace', Boolean(wsCount), (await wsp.locator('.lib-count').textContent()) ?? '');
  await wsp.goto(`${base}/workspace.html#/workspaces`);
  await wsp.locator('.ws-card', { hasText: 'Machine learning' }).click();
  const wsPage = await until(async () => ((await wsp.getByRole('heading', { name: 'Captures (2)' }).count()) ? true : null), 5000);
  check('the workspace page lists its captures', Boolean(wsPage));
  await wsp.close();

  section('Study notebooks');
  const st = await ctx.newPage();
  await st.goto(`${base}/workspace.html#/library`);
  await st.getByRole('button', { name: 'Tables' }).click();
  await st.locator('.entry .linkish').first().click();
  await st.getByText('Study: flashcards and quiz').click();
  await st.locator('[data-testid=study-maker] input').fill('ML notebook');
  await st.getByRole('button', { name: 'Make flashcards and quiz' }).click();
  const savedSet = await until(async () => st.locator('[data-testid=study-saved]').textContent({ timeout: 500 }), 20_000);
  check('generates flashcards and a quiz and saves them in a notebook', /Saved 2 flashcards and 2 quiz questions to “ML notebook”/.test(savedSet ?? ''), savedSet ?? (await st.locator('[data-testid=study-maker]').textContent()) ?? '');
  await st.goto(`${base}/workspace.html#/study`);
  await st.locator('[data-testid=notebook-card]', { hasText: 'ML notebook' }).click();
  await st.getByRole('button', { name: 'Show answer' }).click();
  const ans = await st.locator('[data-testid=fc-answer]').textContent();
  await st.getByRole('button', { name: 'Good', exact: true }).click();
  const reviewed = await until(async () => ((await st.getByRole('tab', { name: 'Review (1)' }).count()) ? true : null), 5000);
  check('reviews a flashcard and schedules it for later', Boolean(ans) && Boolean(reviewed), ans ?? '');
  await st.getByRole('tab', { name: 'Quiz' }).click();
  await st.getByRole('radio', { name: 'CNN' }).check();
  await st.getByRole('radio', { name: '0.91' }).check();
  await st.getByRole('button', { name: 'Check answers' }).click();
  check('takes a quiz and scores it', /1 of 2 right/.test((await st.locator('[data-testid=quiz-score]').textContent()) ?? ''));
  await st.getByRole('tab', { name: 'Progress' }).click();
  check('shows progress per notebook', /Best scores*50%/.test((await st.locator('[data-testid=progress]').textContent()) ?? ''), (await st.locator('[data-testid=progress]').textContent()) ?? '');
  await st.getByRole('button', { name: 'Suggest what to study next (AI)' }).click();
  const gapsText = await until(async () => {
    const t = await st.locator('[data-testid=multi-answer][aria-busy=false]').textContent({ timeout: 500 });
    return /Practise reading recall/.test(t ?? '') ? t : null;
  }, 20_000);
  check('suggests learning gaps on request, labelled as AI', Boolean(gapsText) && (await st.getByText('Suggested by AI').count()) === 1);
  await st.close();

  section('Workspace and themes');
  const ws = await ctx.newPage();
  await ws.goto(`${base}/workspace.html#/settings/ai`);
  const conn = await until(async () => ((await ws.getByText('Connected · 2 models').count()) ? true : null), 15_000);
  check('AI models shows Ollama connected with 2 models', Boolean(conn));
  check('detects which model can see images', (await ws.locator('tr', { hasText: 'llava:7b' }).getByText('Vision', { exact: true }).count()) === 1);
  check('reads the context size from Ollama', (await ws.locator('tr', { hasText: 'qwen2.5:7b' }).getByText('32K').count()) === 1);
  check('explains who handles each task', (await ws.getByText('The only ready model that can see images').count()) + (await ws.getByText(/can see images and runs on this computer/).count()) > 0);
  await ws.locator('tr', { hasText: 'llava:7b' }).getByRole('button', { name: 'Test' }).click();
  const indexed = await until(async () => {
    const t = await ws.locator('[data-testid=semantic-count]').textContent({ timeout: 500 });
    return /^(?<n>\d+) of \k<n> captures indexed with nomic-embed-text/.test(t ?? '') ? t : null;
  }, 15_000);
  check('search by meaning uses the local embedding model and indexes every capture', Boolean(indexed), (await ws.locator('[data-testid=semantic-settings]').textContent().catch(() => '')) ?? '');
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

  section('Duplicates and smart cleanup');
  const cl = await ctx.newPage();
  await cl.goto(`${base}/workspace.html#/settings/cleanup`);
  const dupGroup = await until(async () => {
    const exact = cl.locator('[data-testid=cleanup-exact] .clean-group');
    const similar = cl.locator('[data-testid=cleanup-similar] .clean-group');
    const g = (await exact.count()) ? exact.first() : (await similar.count()) ? similar.first() : null;
    return g && (await g.locator('.clean-item').count()) >= 2 ? g : null;
  }, 20_000);
  check('two identical captures are offered as duplicates', Boolean(dupGroup), (await cl.locator('main').textContent()) ?? '');
  if (dupGroup) {
    const items = dupGroup.locator('.clean-item');
    const keepChecked = await items.first().locator('input[type=checkbox]').isChecked();
    const restChecked = await items.nth(1).locator('input[type=checkbox]').isChecked();
    check('keeps one of each group and suggests deleting the copy', !keepChecked && (await items.first().getByText('Suggested to keep').count()) === 1 && (restChecked || /Kept|Pinned/.test((await items.nth(1).textContent()) ?? '')));
  }
  check('nothing is deleted before you confirm', (await control.evaluate(() => new Promise((r) => { const q = indexedDB.open('eidetic'); q.onsuccess = () => { const g = q.result.transaction('captures').objectStore('captures').count(); g.onsuccess = () => r(g.result); }; }))) >= 8);
  await cl.goto(`${base}/workspace.html#/settings/storage`);
  const byKind = await until(async () => cl.locator('[data-testid=by-kind]').textContent({ timeout: 500 }), 10_000);
  check('the storage dashboard shows space by kind, workspace and month', /Table/.test(byKind ?? '') && (await cl.locator('[data-testid=by-workspace]').count()) === 1 && (await cl.locator('[data-testid=by-month]').count()) === 1, byKind ?? '');
  await cl.close();

  section('Full backup and import');
  const countCaptures = () => control.evaluate(() => new Promise((r) => { const q = indexedDB.open('eidetic'); q.onsuccess = () => { const g = q.result.transaction('captures').objectStore('captures').count(); g.onsuccess = () => r(g.result); }; }));
  const bk = await ctx.newPage();
  await bk.goto(`${base}/workspace.html#/settings/storage`);
  const [bdl] = await Promise.all([bk.waitForEvent('download', { timeout: 60_000 }), bk.click('[data-testid=backup-export]')]);
  const backupPath = await bdl.path();
  const backupText = readFileSync(backupPath, 'utf8');
  const backup = JSON.parse(backupText);
  const beforeCount = await countCaptures();
  check('backs up every capture with its image, plus workspaces, notebooks and watched pages', backup.format === 'eidetic-backup' && backup.captures.length === beforeCount && backup.captures.every((c) => c.imageData?.length > 100) && backup.workspaces.length >= 1 && backup.notebooks.length >= 1 && backup.monitors.length >= 1, `${backup.captures?.length} of ${beforeCount}`);
  check('the backup never contains API keys', !backupText.includes('test-key') && bdl.suggestedFilename().endsWith('.eidetic.json'), bdl.suggestedFilename());
  await bk.goto(`${base}/workspace.html#/library`);
  await bk.getByRole('button', { name: 'Select all shown' }).click();
  await bk.getByRole('button', { name: 'Delete…' }).click();
  await bk.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  const emptied = await until(async () => ((await countCaptures()) === 0 ? true : null), 10_000);
  await bk.goto(`${base}/workspace.html#/settings/storage`);
  await bk.setInputFiles('#backup-file', backupPath);
  const importLine = await until(async () => bk.locator('[data-testid=import-report]').textContent({ timeout: 500 }), 60_000);
  const afterCount = await countCaptures();
  check('importing the backup into the emptied library restores every capture', Boolean(emptied) && afterCount === beforeCount && new RegExp(`Added ${beforeCount} captures`).test(importLine ?? ''), `${importLine} (${afterCount} of ${beforeCount})`);
  await bk.goto(`${base}/workspace.html#/library`);
  const restoredCount = await until(async () => {
    const t = await bk.locator('.lib-count').textContent();
    return (t ?? '').startsWith(`${beforeCount} captures`) ? t : null;
  }, 10_000);
  check('the restored library is searchable again', Boolean(restoredCount));
  await bk.close();

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
