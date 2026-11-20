/**
 * Checking watched pages, from the background (alarms) or when the user presses "Check now". The page is fetched
 * without cookies and parsed with DOMParser: in Firefox's background page directly, in Chrome in an offscreen
 * document (service workers have no DOM). Nothing on the page runs.
 */
import { applyCheck, getMonitor, isDue, listMonitors, originOf, saveMonitor, unreadTotal, type Monitor } from './monitor';
import { extractText } from './monitor';
import { readSelector } from './selector';

type ParseRequest = { type: 'eidetic-parse'; html: string; selector: string };

async function parseHere(html: string, selector: string): Promise<string | null> {
  if (typeof DOMParser !== 'undefined') return extractText(html, selector);
  const off = (chrome as unknown as { offscreen?: { hasDocument?: () => Promise<boolean>; createDocument: (o: { url: string; reasons: string[]; justification: string }) => Promise<void> } }).offscreen;
  if (!off) throw new Error('This browser can’t read pages in the background.');
  if (!(await off.hasDocument?.().catch(() => false))) {
    await off.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Read the watched part of a page the user chose to monitor.' }).catch((e: Error) => {
      if (!/single offscreen|already/i.test(e.message)) throw e;
    });
  }
  const req: ParseRequest = { type: 'eidetic-parse', html, selector };
  const res = (await chrome.runtime.sendMessage(req)) as { text: string | null } | undefined;
  return res?.text ?? null;
}

export async function updateBadge(list?: Monitor[]): Promise<void> {
  const n = unreadTotal(list ?? (await listMonitors()));
  await chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' }).catch(() => undefined);
  await chrome.action.setBadgeBackgroundColor?.({ color: '#2f45d8' })?.catch?.(() => undefined);
}

async function notify(m: Monitor): Promise<void> {
  const { notifyMonitors } = await chrome.storage.local.get('notifyMonitors');
  if (!notifyMonitors || !chrome.notifications || !(await chrome.permissions.contains({ permissions: ['notifications'] }).catch(() => false))) return;
  const last = m.changes[m.changes.length - 1];
  chrome.notifications.create(`monitor-${m.id}`, { type: 'basic', iconUrl: 'icons/icon-128.png', title: `Changed: ${m.title || m.site}`.slice(0, 120), message: last?.line ?? 'The watched part of the page changed.' });
}

/** Fetches and compares one monitor; `force` checks even when it isn't due. */
export async function checkMonitor(id: string, fetcher: typeof fetch = fetch): Promise<Monitor | undefined> {
  const m = await getMonitor(id);
  if (!m) return undefined;
  const origin = originOf(m.url);
  let result: Parameters<typeof applyCheck>[1];
  if (!origin || !(await chrome.permissions.contains({ origins: [origin] }).catch(() => false))) result = { error: `Eidetic isn’t allowed to check ${m.site} yet.`, permission: true };
  else {
    try {
      const res = await fetcher(m.url, { credentials: 'omit', cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error(`The site answered ${res.status}.`);
      const text = await parseHere(await res.text(), m.selector);
      result = text === null ? { notFound: true } : { text };
    } catch (e) {
      result = { error: (e as Error).message || 'Couldn’t reach the page.' };
    }
  }
  const { next, changed } = applyCheck(m, result);
  await saveMonitor(next);
  if (changed) await notify(next);
  await updateBadge();
  return next;
}

/** "Check by opening the page": for pages that build their content with scripts. Opens it in a background tab. */
export async function checkByOpening(id: string): Promise<Monitor | undefined> {
  const m = await getMonitor(id);
  if (!m) return undefined;
  const tab = await chrome.tabs.create({ url: m.url, active: false });
  try {
    await new Promise<void>((resolve) => {
      const done = () => {
        chrome.tabs.onUpdated.removeListener(fn);
        clearTimeout(timer);
        resolve();
      };
      const fn = (tid: number, info: { status?: string }) => tid === tab.id && info.status === 'complete' && done();
      const timer = setTimeout(done, 20_000);
      chrome.tabs.onUpdated.addListener(fn);
    });
    await new Promise((r) => setTimeout(r, 1500)); // let the page's scripts fill in the content
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: readSelector, args: [m.selector] });
    const text = (res?.result ?? null) as string | null;
    const { next, changed } = applyCheck(m, text === null ? { notFound: true } : { text });
    await saveMonitor(next);
    if (changed) await notify(next);
    await updateBadge();
    return next;
  } catch (e) {
    const { next } = applyCheck(m, { error: (e as Error).message });
    await saveMonitor(next);
    return next;
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

/** The alarm: checks every monitor that is due, one after another. */
export async function checkDue(now = Date.now()): Promise<number> {
  let n = 0;
  for (const m of await listMonitors()) {
    if (!isDue(m, now)) continue;
    await checkMonitor(m.id).catch(() => undefined);
    n += 1;
  }
  return n;
}

export const MONITOR_ALARM = 'eidetic-monitors';
