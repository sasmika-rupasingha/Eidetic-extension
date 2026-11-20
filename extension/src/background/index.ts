/**
 * Service worker: the keyboard shortcut, the right-click menu, opening the panel, and expiring old temporary captures.
 * It never reads pages on its own: a page is touched only after the user's shortcut, menu click or panel button.
 */
import { captureTab } from '../capture/capture';
import { checkByOpening, checkDue, checkMonitor, MONITOR_ALARM, updateBadge } from '../monitor/check';
import { startWatch } from '../monitor/watch';
import { expireTemporary } from '../store/captures';
import { loadSettings } from '../store/settings';

type FirefoxBrowser = { sidebarAction?: { open(): Promise<void>; toggle(): Promise<void> } };
const ff = (globalThis as unknown as { browser?: FirefoxBrowser }).browser;
const isFirefox = Boolean(ff?.sidebarAction);

/** Must run synchronously inside the user's gesture (before any await), or the browser refuses. */
function openPanel(windowId?: number): void {
  if (isFirefox) void ff!.sidebarAction!.open().catch(() => undefined);
  else if (windowId !== undefined) void chrome.sidePanel.open({ windowId }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  if (!isFirefox) void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'capture-area', title: 'Capture an area with Eidetic', contexts: ['page', 'image', 'selection', 'video', 'link', 'frame'] });
    chrome.contextMenus.create({ id: 'capture-full', title: 'Capture the visible page', contexts: ['page', 'video', 'frame'] });
    chrome.contextMenus.create({ id: 'watch-part', title: 'Watch part of this page for changes', contexts: ['page', 'selection', 'link', 'image'] });
  });
  void cleanup();
  void scheduleMonitors();
});
chrome.runtime.onStartup.addListener(() => {
  void cleanup();
  void scheduleMonitors();
});
if (isFirefox) chrome.action.onClicked.addListener(() => void ff!.sidebarAction!.toggle());

async function cleanup() {
  const s = await loadSettings();
  await expireTemporary(s.tempDays).catch(() => undefined);
}

function start(tab: chrome.tabs.Tab | undefined, mode: 'area' | 'full') {
  if (!tab) return;
  openPanel(tab.windowId);
  // Errors are shown by the panel (it watches the "latest capture" record), so nothing is lost if this fails.
  void captureTab(tab, mode).catch(() => undefined);
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture') start(tab, 'area');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-area') start(tab, 'area');
  if (info.menuItemId === 'capture-full') start(tab, 'full');
  if (info.menuItemId === 'watch-part' && tab) {
    openPanel(tab.windowId);
    void startWatch(tab).then((m) => m && chrome.storage.session.set({ latestMonitor: { id: m.id, at: Date.now() } })).catch(() => undefined);
  }
});

/* ---------------------------------------------------------------- website monitoring */
async function scheduleMonitors() {
  if (!(await chrome.alarms.get(MONITOR_ALARM))) await chrome.alarms.create(MONITOR_ALARM, { periodInMinutes: 15, delayInMinutes: 1 });
  await updateBadge().catch(() => undefined);
}
void scheduleMonitors();

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === MONITOR_ALARM) void checkDue().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((msg: { type?: string; id?: string }, _sender, reply) => {
  if (msg?.type === 'monitor-check' && msg.id) {
    void checkMonitor(msg.id).then((m) => reply({ ok: true, status: m?.status }), (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === 'monitor-open-check' && msg.id) {
    void checkByOpening(msg.id).then((m) => reply({ ok: true, status: m?.status }), (e: Error) => reply({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === 'monitor-badge') {
    void updateBadge().then(() => reply({ ok: true }));
    return true;
  }
  return undefined;
});

chrome.notifications?.onClicked.addListener((nid) => {
  if (nid.startsWith('monitor-')) void chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html#/monitor') });
});
