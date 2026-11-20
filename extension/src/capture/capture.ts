/**
 * Taking a capture: screenshot of the visible tab → the overlay (choose an area) → crop → saved to the library as a
 * temporary capture. Used by the background (shortcut, right-click menu) and by the side panel's buttons.
 * Reading the text, detecting the content and so on happens afterwards in the panel (capture/pipeline.ts).
 */
import { captureOverlay, type OverlayResult } from '../content/overlay';
import { blobToDataUrl, cropScreenshot, dataUrlToBlob, thumbnail } from '../shared/image';
import { addCapture, siteOf, type Capture, type VideoMoment } from '../store/captures';
import { loadSettings, type Accent } from '../store/settings';

export class AccessError extends Error {
  constructor(message = 'Eidetic needs permission to capture this page.') {
    super(message);
  }
}

export const RESTRICTED =
  /^(chrome|edge|brave|opera|vivaldi|about|moz-extension|chrome-extension|view-source|devtools|chrome-search):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons)/i;

/** The accent on dark surfaces (the overlay is always dark). */
export const OVERLAY_ACCENT: Record<Accent, string> = { ultramarine: '#97A3FF', vermilion: '#FF8F75', moss: '#A8D385', graphite: '#ECE9E2' };

/** Where the panel learns that a capture was just taken, or that one is in progress. */
export const SESSION_LATEST = 'latestCapture';
/** `access` marks a failure caused by Chrome not letting Eidetic see the page (the panel shows access help, not an error). */
export type LatestCapture = { id: string; at: number } | { selecting: true; at: number } | { cancelled: true; at: number } | { error: string; access?: true; at: number };

const isAccessError = (e: unknown) => /permission|cannot access|activeTab|not allowed|Missing host|cannot be scripted/i.test(String((e as Error)?.message ?? e));

export async function screenshotTab(windowId: number): Promise<string> {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (e) {
    throw isAccessError(e) ? new AccessError() : e;
  }
}

/** A link that reopens the video at this moment, where the site supports it; otherwise none (never a fake link). */
export function resumeUrl(pageUrl: string, seconds: number): string | undefined {
  const t = Math.max(0, Math.floor(seconds));
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtube.com' && (u.pathname === '/watch' || u.pathname.startsWith('/live/'))) {
      u.searchParams.set('t', `${t}s`);
      return u.href;
    }
    if (host === 'youtu.be') {
      u.searchParams.set('t', `${t}s`);
      return u.href;
    }
    if (/\.(mp4|webm|ogv|m4v|mov)$/i.test(u.pathname)) {
      u.hash = `t=${t}`;
      return u.href;
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}

export const formatTime = (sec: number) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

async function setLatest(v: LatestCapture): Promise<void> {
  await chrome.storage.session.set({ [SESSION_LATEST]: v }).catch(() => undefined);
}

/** Saves an image (a crop, a pasted image or a file) as a new capture. */
export async function saveImage(dataUrl: string, w: number, h: number, source: Capture['source'], extra: { video?: VideoMoment; needsCrop?: boolean; area?: Capture['area']; compareTo?: string } = {}): Promise<Capture> {
  const blob = await dataUrlToBlob(dataUrl);
  const cap = await addCapture({ image: blob, w, h, thumb: await thumbnail(dataUrl, 320), source, ...extra });
  await setLatest({ id: cap.id, at: Date.now() });
  return cap;
}

export async function saveBlob(blob: Blob, source: Capture['source']): Promise<Capture> {
  const dataUrl = await blobToDataUrl(blob);
  const bmp = await createImageBitmap(blob);
  const { width, height } = bmp;
  bmp.close();
  return saveImage(dataUrl, width, height, source);
}

/**
 * Captures an area (or the whole visible tab) of `tab`. Resolves to the new capture, or null if cancelled.
 * Throws AccessError when Eidetic may not capture this page yet.
 */
export interface CaptureOptions {
  /** Start the overlay with this box (Capture & Compare on the same page). */
  preset?: { x: number; y: number; w: number; h: number; vw?: number; vh?: number } | null;
  /** The capture this new one is compared with. */
  compareTo?: string;
}

export async function captureTab(tab: chrome.tabs.Tab, mode: 'area' | 'full' = 'area', opts: CaptureOptions = {}): Promise<Capture | null> {
  if (!tab.id || tab.windowId === undefined) throw new Error('No tab to capture.');
  if (tab.url && RESTRICTED.test(tab.url)) throw new Error('Browser pages and extension stores can’t be captured. Open a normal web page.');
  await setLatest({ selecting: true, at: Date.now() });
  try {
    const shot = await screenshotTab(tab.windowId);
    const settings = await loadSettings();
    const pageSource = (url: string, title: string) => ({ url, title, site: siteOf(url) });
    if (mode === 'full') {
      const bmp = await createImageBitmap(await dataUrlToBlob(shot));
      const size = { w: bmp.width, h: bmp.height };
      bmp.close();
      return await saveImage(shot, size.w, size.h, pageSource(tab.url ?? '', tab.title ?? ''), opts.compareTo ? { compareTo: opts.compareTo } : {});
    }
    let picked: OverlayResult | null;
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureOverlay, args: [shot, OVERLAY_ACCENT[settings.accent], opts.preset ?? null] });
      picked = (res?.result ?? null) as OverlayResult | null;
    } catch (e) {
      if (isAccessError(e) && !tab.url) throw new AccessError();
      // The screenshot worked but the page refuses injected code (Chrome's PDF viewer, some protected pages):
      // keep the whole screen and let the user crop it in the panel.
      const bmp = await createImageBitmap(await dataUrlToBlob(shot));
      const size = { w: bmp.width, h: bmp.height };
      bmp.close();
      return await saveImage(shot, size.w, size.h, pageSource(tab.url ?? '', tab.title ?? ''), { needsCrop: true, ...(opts.compareTo ? { compareTo: opts.compareTo } : {}) });
    }
    if (!picked) {
      await setLatest({ cancelled: true, at: Date.now() });
      return null;
    }
    const crop = await cropScreenshot(shot, picked.rect, picked.viewport);
    const video: VideoMoment | undefined = picked.video
      ? { time: picked.video.time, ...(picked.video.duration ? { duration: picked.video.duration } : {}), title: picked.video.title, url: picked.video.url, resumeUrl: resumeUrl(picked.video.url, picked.video.time) }
      : undefined;
    return await saveImage(crop.dataUrl, crop.w, crop.h, pageSource(picked.url, picked.title), { ...(video ? { video } : {}), area: { rect: picked.rect, viewport: picked.viewport }, ...(opts.compareTo ? { compareTo: opts.compareTo } : {}) });
  } catch (e) {
    await setLatest({ error: (e as Error).message, ...(e instanceof AccessError ? { access: true as const } : {}), at: Date.now() });
    throw e;
  }
}

/** The tab the user is looking at (never one of Eidetic's own pages). */
export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const own = chrome.runtime.getURL('');
  const notOwn = (t: chrome.tabs.Tab) => !(t.url ?? t.pendingUrl ?? '').startsWith(own);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' });
  if (tab && notOwn(tab)) return tab;
  const others = await chrome.tabs.query({ active: true, windowType: 'normal' });
  return others.find(notOwn);
}
