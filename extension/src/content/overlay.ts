/**
 * The capture overlay, injected with chrome.scripting.executeScript({ func: captureOverlay }). It must be completely
 * self-contained (no imports, no outside variables). It shows the frozen screenshot so video and animations stop,
 * lets the user drag a box, adjust it with handles or move it, and resolves with the box in CSS pixels (null on
 * cancel). If a <video> is under the box, its current time comes back too.
 * Everything lives in a closed shadow root, built with createElement (pages with Trusted Types forbid innerHTML).
 */
export interface OverlayResult {
  rect: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
  url: string;
  title: string;
  video?: { time: number; duration?: number; title: string; url: string };
}

/** `preset`: a box to start with (Capture & Compare on the same page), in CSS pixels of this viewport. */
export function captureOverlay(screenshot: string, accent: string, preset?: { x: number; y: number; w: number; h: number; vw?: number; vh?: number } | null): Promise<OverlayResult | null> {
  return new Promise((resolve) => {
    document.getElementById('eidetic-capture-host')?.remove();
    const host = document.createElement('div');
    host.id = 'eidetic-capture-host';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MIN = 8;

    const css = document.createElement('style');
    css.textContent = `
      :host { all: initial; }
      .wrap { position: fixed; inset: 0; cursor: crosshair; user-select: none; -webkit-user-select: none; font: 500 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #ece9e2; }
      .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
      .veil { position: absolute; inset: 0; background: rgba(8, 9, 11, 0.55); }
      .box { position: absolute; display: none; border: 1.5px solid ${accent}; box-shadow: 0 0 0 9999px rgba(8, 9, 11, 0.6); cursor: move; }
      .h { position: absolute; width: 10px; height: 10px; background: #fff; border: 1.5px solid ${accent}; box-sizing: border-box; }
      .h.nw { left: -6px; top: -6px; cursor: nwse-resize; } .h.n { left: calc(50% - 5px); top: -6px; cursor: ns-resize; }
      .h.ne { right: -6px; top: -6px; cursor: nesw-resize; } .h.e { right: -6px; top: calc(50% - 5px); cursor: ew-resize; }
      .h.se { right: -6px; bottom: -6px; cursor: nwse-resize; } .h.s { left: calc(50% - 5px); bottom: -6px; cursor: ns-resize; }
      .h.sw { left: -6px; bottom: -6px; cursor: nesw-resize; } .h.w { left: -6px; top: calc(50% - 5px); cursor: ew-resize; }
      .size { position: absolute; display: none; padding: 3px 8px; border-radius: 4px; background: rgba(14, 15, 17, 0.88); font: 500 12px ui-monospace, 'IBM Plex Mono', Consolas, monospace; white-space: nowrap; pointer-events: none; }
      .glass { background: rgba(24, 25, 28, 0.78); backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4); }
      .hint { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 9px 16px; border-radius: 999px; white-space: nowrap; pointer-events: none; transition: opacity .15s; }
      .bar { position: absolute; display: none; align-items: center; gap: 4px; padding: 6px; border-radius: 12px; cursor: default; }
      .bar button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 8px; cursor: pointer; font: 500 13.5px system-ui, -apple-system, 'Segoe UI', sans-serif; color: #ece9e2; white-space: nowrap; }
      .bar button:hover { background: rgba(255, 255, 255, 0.08); }
      .bar button:focus-visible { outline: 2px solid ${accent}; outline-offset: 1px; }
      .bar button.go { background: ${accent}; color: #0e0f11; font-weight: 600; }
      .bar button.go:hover { filter: brightness(1.08); background: ${accent}; }
      .k { font: 500 10.5px ui-monospace, 'IBM Plex Mono', Consolas, monospace; padding: 1px 5px; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 4px; color: #a39f96; }
      .go .k { border-color: rgba(14, 15, 17, 0.3); color: #0e0f11; }
      .vid { display: none; align-items: center; gap: 7px; height: 40px; padding: 0 12px 0 8px; color: #cfcbc2; font: 500 12px ui-monospace, 'IBM Plex Mono', Consolas, monospace; white-space: nowrap; }
      .sep { width: 1px; height: 24px; background: rgba(255, 255, 255, 0.14); }
      .mark { width: 16px; height: 16px; flex-shrink: 0; }
      @media (prefers-reduced-motion: reduce) { .hint { transition: none; } }
    `;

    const el = (tag: string, cls = '', text = '') => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const svgNs = 'http://www.w3.org/2000/svg';
    const mark = () => {
      const s = document.createElementNS(svgNs, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('class', 'mark');
      const p = document.createElementNS(svgNs, 'path');
      p.setAttribute('d', 'M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#ece9e2');
      p.setAttribute('stroke-width', '1.9');
      p.setAttribute('stroke-linecap', 'round');
      const c = document.createElementNS(svgNs, 'circle');
      c.setAttribute('cx', '14.5');
      c.setAttribute('cy', '9.5');
      c.setAttribute('r', '2.6');
      c.setAttribute('fill', accent);
      s.append(p, c);
      return s;
    };

    const wrap = el('div', 'wrap');
    const img = el('img', 'shot') as HTMLImageElement;
    img.alt = '';
    img.src = screenshot;
    const veil = el('div', 'veil');
    const box = el('div', 'box');
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((d) => {
      const h = el('span', `h ${d}`);
      h.dataset.dir = d;
      box.append(h);
      return h;
    });
    const size = el('div', 'size');
    const hint = el('div', 'hint glass');
    hint.setAttribute('role', 'status');
    hint.append(mark(), el('span', '', 'Drag to select. The page is frozen while you choose.'));

    const bar = el('div', 'bar glass');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Capture');
    const vid = el('span', 'vid');
    const vidSep = el('span', 'sep');
    vidSep.style.display = 'none';
    const btn = (label: string, key: string, cls = '') => {
      const b = el('button', cls);
      b.setAttribute('type', 'button');
      b.append(el('span', '', label), el('span', 'k', key));
      return b;
    };
    const bCancel = btn('Cancel', 'Esc');
    const bFull = btn('Full screen', 'F');
    const bGo = btn('Capture', 'Enter', 'go');
    bar.append(vid, vidSep, bCancel, bFull, bGo);
    wrap.append(img, veil, box, size, hint, bar);
    root.append(css, wrap);
    document.documentElement.append(host);

    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let drag: { mode: 'new' | 'move' | string; sx: number; sy: number; start: typeof rect } | null = null;
    let done = false;

    const clampRect = (r: typeof rect) => {
      const x = Math.max(0, Math.min(r.x, vw - MIN));
      const y = Math.max(0, Math.min(r.y, vh - MIN));
      return { x, y, w: Math.max(MIN, Math.min(r.w, vw - x)), h: Math.max(MIN, Math.min(r.h, vh - y)) };
    };

    const videoUnder = () => {
      let best: HTMLVideoElement | null = null;
      let bestArea = 0;
      for (const v of Array.from(document.querySelectorAll('video'))) {
        const r = v.getBoundingClientRect();
        const ix = Math.max(0, Math.min(r.right, rect.x + rect.w) - Math.max(r.left, rect.x));
        const iy = Math.max(0, Math.min(r.bottom, rect.y + rect.h) - Math.max(r.top, rect.y));
        const area = ix * iy;
        if (area > bestArea && area >= rect.w * rect.h * 0.3 && Number.isFinite(v.currentTime) && (v.currentTime > 0 || v.duration > 0)) {
          best = v;
          bestArea = area;
        }
      }
      return best;
    };
    const fmt = (t: number) => {
      const s = Math.floor(t);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = String(s % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    };

    const finish = (r: typeof rect | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      const v = r ? videoUnder() : null;
      host.remove();
      if (!r) return resolve(null);
      const res: OverlayResult = { rect: r, viewport: { w: vw, h: vh }, url: location.href, title: document.title };
      if (v) res.video = { time: v.currentTime, ...(Number.isFinite(v.duration) ? { duration: v.duration } : {}), title: document.title, url: location.href };
      resolve(res);
    };

    const draw = () => {
      const show = rect.w >= MIN && rect.h >= MIN;
      box.style.display = show ? 'block' : 'none';
      veil.style.display = show ? 'none' : 'block';
      size.style.display = show ? 'block' : 'none';
      if (!show) {
        bar.style.display = 'none';
        return;
      }
      Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
      size.style.left = `${Math.max(4, Math.min(rect.x, vw - 110))}px`;
      size.style.top = `${rect.y > 30 ? rect.y - 28 : rect.y + 6}px`;
      hint.style.opacity = rect.y < 70 && rect.x < vw / 2 + 240 && rect.x + rect.w > vw / 2 - 240 ? '0' : '1';
      // Toolbar below the box, or above it, or inside at the bottom when neither fits.
      bar.style.display = drag ? 'none' : 'flex';
      const v = videoUnder();
      vid.style.display = v ? 'inline-flex' : 'none';
      vidSep.style.display = v ? 'block' : 'none';
      if (v) vid.textContent = `Video · keeps ${fmt(v.currentTime)}`;
      const bw = bar.offsetWidth || 380;
      const bh = 54;
      const left = Math.max(8, Math.min(rect.x + rect.w / 2 - bw / 2, vw - bw - 8));
      let top = rect.y + rect.h + 12;
      if (top + bh > vh - 8) top = rect.y - bh - 12;
      if (top < 8) top = rect.y + rect.h - bh - 8;
      bar.style.left = `${left}px`;
      bar.style.top = `${Math.max(8, top)}px`;
      if (!drag) bGo.focus({ preventScroll: true });
    };

    const onKey = (e: KeyboardEvent) => {
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === 'Escape') {
        stop();
        finish(null);
      } else if (e.key === 'Enter') {
        stop();
        finish(rect.w >= MIN && rect.h >= MIN ? rect : { x: 0, y: 0, w: vw, h: vh });
      } else if (e.key === 'f' || e.key === 'F') {
        stop();
        finish({ x: 0, y: 0, w: vw, h: vh });
      } else if (rect.w >= MIN && e.key.startsWith('Arrow')) {
        // Arrow keys nudge the selection; Shift+arrow resizes it.
        stop();
        const step = e.altKey ? 1 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        rect = clampRect(e.shiftKey ? { ...rect, w: rect.w + dx, h: rect.h + dy } : { ...rect, x: rect.x + dx, y: rect.y + dy });
        draw();
      } else if (e.key === 'Tab') {
        // Keep focus inside the toolbar while the overlay is open.
        const btns = [bCancel, bFull, bGo];
        const i = btns.indexOf(root.activeElement as HTMLElement);
        stop();
        btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length]!.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);

    bCancel.addEventListener('click', () => finish(null));
    bFull.addEventListener('click', () => finish({ x: 0, y: 0, w: vw, h: vh }));
    bGo.addEventListener('click', () => finish(rect.w >= MIN && rect.h >= MIN ? rect : { x: 0, y: 0, w: vw, h: vh }));
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());

    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return finish(null);
      const t = e.target as HTMLElement;
      const mode = t.dataset.dir ?? (t === box ? 'move' : 'new');
      wrap.setPointerCapture(e.pointerId);
      drag = { mode, sx: e.clientX, sy: e.clientY, start: { ...rect } };
      if (mode === 'new') rect = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const x = Math.max(0, Math.min(e.clientX, vw));
      const y = Math.max(0, Math.min(e.clientY, vh));
      const dx = x - drag.sx;
      const dy = y - drag.sy;
      const s = drag.start;
      if (drag.mode === 'new') rect = { x: Math.min(drag.sx, x), y: Math.min(drag.sy, y), w: Math.abs(x - drag.sx), h: Math.abs(y - drag.sy) };
      else if (drag.mode === 'move') rect = { ...s, x: Math.max(0, Math.min(s.x + dx, vw - s.w)), y: Math.max(0, Math.min(s.y + dy, vh - s.h)) };
      else {
        let { x: l, y: t2 } = s;
        let r = s.x + s.w;
        let b = s.y + s.h;
        if (drag.mode.includes('w')) l = Math.min(s.x + dx, r - MIN);
        if (drag.mode.includes('e')) r = Math.max(s.x + s.w + dx, l + MIN);
        if (drag.mode.includes('n')) t2 = Math.min(s.y + dy, b - MIN);
        if (drag.mode.includes('s')) b = Math.max(s.y + s.h + dy, t2 + MIN);
        rect = { x: l, y: t2, w: r - l, h: b - t2 };
      }
      draw();
    });
    wrap.addEventListener('pointerup', () => {
      if (!drag) return;
      const wasNew = drag.mode === 'new';
      drag = null;
      if (wasNew && (rect.w < MIN || rect.h < MIN)) rect = { x: 0, y: 0, w: 0, h: 0 };
      draw();
    });
    wrap.addEventListener('dblclick', () => {
      if (rect.w >= MIN && rect.h >= MIN) finish(rect);
    });
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      finish(null);
    });
    if (preset && preset.w >= MIN && preset.h >= MIN) {
      // Chosen in a window of another size: scale it to this one.
      const sx = preset.vw ? vw / preset.vw : 1;
      const sy = preset.vh ? vh / preset.vh : 1;
      rect = clampRect({ x: preset.x * sx, y: preset.y * sy, w: preset.w * sx, h: preset.h * sy });
      hint.lastElementChild!.textContent = 'Same area as before. Press Enter to capture, or adjust it.';
      draw();
    }
    void handles;
  });
}
