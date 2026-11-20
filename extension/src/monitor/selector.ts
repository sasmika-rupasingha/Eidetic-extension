/**
 * Choosing the part of a page to watch. These functions are injected with chrome.scripting.executeScript({ func }),
 * so each one is completely self-contained (no imports, no outside variables). They run in Eidetic's isolated world
 * on the page: installSelectorBuilder() first, then pickElement() uses what it installed.
 */

export interface PickResult {
  selector: string;
  text: string;
  url: string;
  title: string;
}

/**
 * Installs `globalThis.__eideticSelector(el)`: a CSS selector that finds `el` again in a fresh copy of the page.
 * It prefers stable ids and test/data attributes, then short class names, and adds :nth-of-type only where needed;
 * generated-looking ids and classes (long numbers, hashes) are skipped. Shortest unique path wins.
 */
export function installSelectorBuilder(): void {
  const g = globalThis as unknown as { __eideticSelector?: (el: Element) => string };
  const looksGenerated = (v: string) => /\d{3,}|[a-f0-9]{8,}|^[a-z]{1,3}-[A-Za-z0-9_-]{5,}$|__|--|:/.test(v) || v.length > 40;
  const esc = (v: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/[^\w-]/g, (c) => `\\${c}`));
  const ATTRS = ['data-testid', 'data-test', 'data-qa', 'itemprop', 'name', 'aria-label'];
  g.__eideticSelector = (target: Element): string => {
    const doc = target.ownerDocument;
    const unique = (sel: string) => {
      try {
        const all = doc.querySelectorAll(sel);
        return all.length === 1 && all[0] === target;
      } catch {
        return false;
      }
    };
    const part = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      if (el.id && !looksGenerated(el.id)) return `#${esc(el.id)}`;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && v.length <= 60 && !looksGenerated(v)) return `${tag}[${a}="${v.replace(/"/g, '\\"')}"]`;
      }
      const classes = Array.from(el.classList).filter((c) => !looksGenerated(c)).slice(0, 2);
      let seg = tag + classes.map((c) => `.${esc(c)}`).join('');
      const parent = el.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
        if (same.length > 1 && Array.from(parent.children).filter((s) => s.matches(seg)).length > 1) seg += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      return seg;
    };
    const parts: string[] = [];
    let el: Element | null = target;
    while (el && el !== doc.documentElement) {
      const p = part(el);
      parts.unshift(p);
      const sel = parts.join(' > ');
      if (unique(sel)) return sel;
      if (p.startsWith('#')) break;
      el = el.parentElement;
    }
    // Fall back to a full path with positions, which is always unique.
    const path: string[] = [];
    el = target;
    while (el && el !== doc.documentElement) {
      const parent: Element | null = el.parentElement;
      const tag = el.tagName.toLowerCase();
      const same = parent ? Array.from(parent.children).filter((s) => s.tagName === el!.tagName) : [];
      path.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag);
      el = parent;
    }
    return path.join(' > ');
  };
}

/** Lets the user point at a part of the page (highlighted under the mouse) and click it. Esc cancels. */
export function pickElement(accent: string): Promise<PickResult | null> {
  return new Promise((resolve) => {
    const g = globalThis as unknown as { __eideticSelector?: (el: Element) => string };
    document.getElementById('eidetic-pick-host')?.remove();
    const host = document.createElement('div');
    host.id = 'eidetic-pick-host';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;pointer-events:none;border:2px solid ${accent};background:rgba(120,140,255,.12);border-radius:3px;display:none;`;
    const tip = document.createElement('div');
    tip.setAttribute('role', 'status');
    tip.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:rgba(19,20,22,.92);color:#ece9e2;font:500 13px/1.3 system-ui,sans-serif;pointer-events:none;';
    tip.textContent = 'Click the part of the page to watch. Up arrow: a larger part. Esc: cancel.';
    root.append(box, tip);
    document.documentElement.append(host);
    let current: Element | null = null;
    const show = (el: Element | null) => {
      current = el;
      if (!el) return void (box.style.display = 'none');
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    };
    const textOf = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/[ \t]+/g, ' ').trim();
    const finish = (el: Element | null) => {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('click', onClick, true);
      removeEventListener('keydown', onKey, true);
      host.remove();
      if (!el || !g.__eideticSelector) return resolve(null);
      resolve({ selector: g.__eideticSelector(el), text: textOf(el).slice(0, 20000), url: location.href, title: document.title });
    };
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== document.documentElement && el !== document.body) show(el);
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      finish(el && el !== document.documentElement ? el : current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      } else if (e.key === 'ArrowUp' && current?.parentElement && current.parentElement !== document.body) {
        e.preventDefault();
        show(current.parentElement);
      } else if (e.key === 'Enter' && current) {
        e.preventDefault();
        finish(current);
      }
    };
    addEventListener('mousemove', onMove, true);
    addEventListener('click', onClick, true);
    addEventListener('keydown', onKey, true);
  });
}

/** For "check by opening the page": the text of the watched part in the live page, or null if it isn't there. */
export function readSelector(selector: string): string | null {
  try {
    const el = document.querySelector(selector);
    return el ? ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/[ \t]+/g, ' ').trim() : null;
  } catch {
    return null;
  }
}
