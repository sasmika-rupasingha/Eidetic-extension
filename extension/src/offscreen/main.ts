/** Chrome's offscreen document: parses fetched pages with DOMParser for website monitoring (no scripts run). */
import { extractText } from '../monitor/monitor';

chrome.runtime.onMessage.addListener((msg: { type?: string; html?: string; selector?: string }, _sender, reply) => {
  if (msg?.type !== 'eidetic-parse' || typeof msg.html !== 'string' || typeof msg.selector !== 'string') return;
  reply({ text: extractText(msg.html, msg.selector) });
});
