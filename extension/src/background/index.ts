/**
 * Service worker: the keyboard shortcut, the right-click menu, opening the panel, and expiring old temporary captures.
 * It never reads pages on its own: a page is touched only after the user's shortcut, menu click or panel button.
 */
import { captureTab } from '../capture/capture';
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
  });
  void cleanup();
});
chrome.runtime.onStartup.addListener(() => void cleanup());
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
});
