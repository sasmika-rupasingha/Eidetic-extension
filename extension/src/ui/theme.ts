/** Applies the theme and accent to <html> (instantly, no reload) and follows the system setting when asked. */
import type { Accent, ThemePref } from '../store/settings';

const MIRROR = 'eidetic-theme';
let mq: MediaQueryList | null = null;
let current: ThemePref = 'system';

const resolve = (pref: ThemePref) => (pref === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref);

export function applyTheme(pref: ThemePref, accent: Accent): void {
  current = pref;
  const root = document.documentElement;
  root.dataset.theme = resolve(pref);
  root.dataset.accent = accent;
  try {
    // Mirror for theme-boot.ts, which runs before settings load so the first paint already has the right colours.
    localStorage.setItem(MIRROR, JSON.stringify({ pref, accent }));
  } catch {
    /* storage unavailable: the theme still applies, it just isn't remembered for first paint */
  }
  if (!mq) {
    mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (current === 'system') root.dataset.theme = resolve('system');
    });
  }
}

export function bootTheme(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(MIRROR) ?? 'null') as { pref?: ThemePref; accent?: Accent } | null;
    const root = document.documentElement;
    root.dataset.theme = resolve(saved?.pref ?? 'system');
    root.dataset.accent = saved?.accent ?? 'ultramarine';
  } catch {
    document.documentElement.dataset.theme = resolve('system');
  }
}
