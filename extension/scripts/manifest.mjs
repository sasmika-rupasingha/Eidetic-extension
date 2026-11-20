/**
 * One source of truth for the manifest; each browser gets the few keys it differs on.
 * Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc): service worker + side panel. Firefox: event page + sidebar.
 */

// AI provider hosts, each requested only when the user adds that provider (src/ai/permissions.ts).
export const PROVIDER_HOSTS = [
  'https://generativelanguage.googleapis.com/*',
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
  'https://openrouter.ai/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
];

export function manifest(target, version) {
  const base = {
    manifest_version: 3,
    name: 'Eidetic: visual memory for the web',
    short_name: 'Eidetic',
    version,
    description: 'Capture anything on screen, understand it and act on it: text, tables, code, errors, slides and video moments. Works offline; AI is optional and yours to choose.',
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: { default_title: 'Open Eidetic', default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } },
    // Least privilege: no "tabs", no content scripts. A page is reachable only after the icon, a shortcut or the
    // right-click menu (activeTab), or after the user allows that one site from the panel (optional host permission).
    // alarms: website monitoring checks on a schedule (v3). Notifications only if the user turns them on.
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'contextMenus', 'alarms'],
    optional_permissions: ['notifications'],
    optional_host_permissions: [...PROVIDER_HOSTS, '<all_urls>'],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+M' }, description: 'Open Eidetic' },
      capture: { suggested_key: { default: 'Alt+Shift+E' }, description: 'Capture an area of the page' },
    },
    // OCR is WebAssembly ('wasm-unsafe-eval'). No remote code, no inline scripts.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
  };
  if (target === 'chromium') {
    return {
      ...base,
      minimum_chrome_version: '120',
      // offscreen: reads watched pages with DOMParser (the service worker has no DOM).
      permissions: [...base.permissions, 'sidePanel', 'offscreen'],
      side_panel: { default_path: 'panel.html' },
      background: { service_worker: 'background.js', type: 'module' },
    };
  }
  if (target === 'firefox') {
    return {
      ...base,
      background: { scripts: ['background.js'], type: 'module' },
      sidebar_action: { default_panel: 'panel.html', default_title: 'Eidetic', default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' }, open_at_install: false },
      browser_specific_settings: {
        gecko: { id: 'eidetic@sasmika-rupasingha.github.io', strict_min_version: '140.0', data_collection_permissions: { required: ['none'], optional: ['websiteContent'] } },
      },
    };
  }
  throw new Error(`unknown target ${target}`);
}
