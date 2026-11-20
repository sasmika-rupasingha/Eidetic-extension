/** "Watch part of this page": the user points at a part of the page; Eidetic saves a monitor for its text. */
import { OVERLAY_ACCENT, RESTRICTED } from '../capture/capture';
import { loadSettings } from '../store/settings';
import { createMonitor, type Monitor } from './monitor';
import { installSelectorBuilder, pickElement, type PickResult } from './selector';

export async function startWatch(tab: chrome.tabs.Tab): Promise<Monitor | null> {
  if (!tab.id) throw new Error('No page to watch.');
  if (tab.url && (RESTRICTED.test(tab.url) || !/^https?:/i.test(tab.url))) throw new Error('Only web pages (http or https) can be watched.');
  const s = await loadSettings();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: installSelectorBuilder });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pickElement, args: [OVERLAY_ACCENT[s.accent]] });
  const picked = (res?.result ?? null) as PickResult | null;
  if (!picked) return null;
  if (!picked.text.trim()) throw new Error('That part of the page has no text to watch. Choose a part with text.');
  return createMonitor(picked);
}
