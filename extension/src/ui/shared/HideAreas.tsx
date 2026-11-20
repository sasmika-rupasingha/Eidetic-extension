/**
 * "Hide part of the image": mark areas by hand (drag, or the keyboard) that a safe copy should hide, for private details
 * the detector didn't find. Detected details are shown too and hidden with them. Only a new image is made: the original
 * capture stays unchanged.
 */
import { useRef, useState } from 'react';
import type { Box } from '../../detect/table';
import { areaBetween, areaToBox, boxToArea, centreArea, nudgeArea, type Area } from '../../privacy/areas';
import type { RedactStyle } from '../../privacy/redact';

export function HideAreas({
  imgUrl,
  width,
  height,
  detected,
  onDownload,
  onClose,
}: {
  imgUrl: string | null;
  width: number;
  height: number;
  /** Boxes of the detected private details the user kept ticked (image pixels). */
  detected: Box[];
  onDownload: (exact: Box[], style: RedactStyle) => Promise<void>;
  onClose: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Area | null>(null);
  const [style, setStyle] = useState<RedactStyle>('black');
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const add = (a: Area) => {
    setAreas((cur) => [...cur, a]);
    setSelected(areas.length);
  };
  const remove = (i: number) => {
    setAreas((cur) => cur.filter((_, j) => j !== i));
    setSelected(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      add(centreArea());
      return;
    }
    if (selected === null) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(selected);
      return;
    }
    const next = nudgeArea(areas[selected]!, e.key, e.shiftKey);
    if (next) {
      e.preventDefault();
      setAreas((cur) => cur.map((a, i) => (i === selected ? next : a)));
    }
  };

  const pct = (a: Area) => ({ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` });
  const total = areas.length + detected.length;

  return (
    <section className="hide-areas" aria-labelledby="hide-areas-h" data-testid="hide-areas">
      <div className="answer-head">
        <h3 id="hide-areas-h" className="h-section">
          Hide part of the image
        </h3>
        <button type="button" className="btn ghost small" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="help" id="hide-areas-help">
        Drag over anything you want hidden. Keyboard: Enter adds an area, arrow keys move it, Shift + arrow keys resize it, Delete removes it.
        {detected.length ? ` The ${detected.length} detected detail${detected.length === 1 ? ' is' : 's are'} hidden too (dashed).` : ''}
      </p>
      <div
        ref={stage}
        className="croppick-stage hide-stage"
        tabIndex={0}
        role="group"
        aria-label="Image: areas to hide"
        aria-describedby="hide-areas-help"
        data-testid="hide-stage"
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.area !== undefined) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = at(e);
          setDraft(null);
        }}
        onPointerMove={(e) => {
          if (start.current) setDraft(areaBetween(start.current, at(e)));
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const a = areaBetween(start.current, at(e));
          start.current = null;
          setDraft(null);
          if (a) add(a);
        }}
      >
        {imgUrl ? <img src={imgUrl} alt="The capture" draggable={false} /> : <div className="img-placeholder" />}
        {detected.map((b, i) => (
          <div key={`d${i}`} className="hide-area detected" style={pct(boxToArea(b, width, height))} aria-hidden="true" />
        ))}
        {areas.map((a, i) => (
          <div
            key={`a${i}`}
            data-area={i}
            className={`hide-area${selected === i ? ' selected' : ''}`}
            style={pct(a)}
            onPointerDown={() => setSelected(i)}
            aria-hidden="true"
          />
        ))}
        {draft ? <div className="hide-area drafting" style={pct(draft)} aria-hidden="true" /> : null}
      </div>
      {areas.length ? (
        <ul className="plain hide-list" aria-label="Areas you marked">
          {areas.map((a, i) => (
            <li key={`l${i}`} className="row-gap">
              <button type="button" className={`btn small ${selected === i ? 'soft' : 'ghost'}`} aria-pressed={selected === i} onClick={() => setSelected(i)}>
                Area {i + 1}
              </button>
              <span className="muted small">
                {Math.round(a.w * 100)} × {Math.round(a.h * 100)} % of the image
              </span>
              <button type="button" className="btn small ghost" onClick={() => remove(i)} aria-label={`Remove area ${i + 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row-gap wrap">
        <div className="seg compact" role="radiogroup" aria-label="How to hide">
          {(
            [
              ['black', 'Black out'],
              ['pixelate', 'Pixelate'],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={style === v} onClick={() => setStyle(v)}>
              <span className="t">{t}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn small primary"
          data-testid="hide-download"
          disabled={!total || busy}
          onClick={() => {
            setBusy(true);
            void onDownload(
              areas.map((a) => areaToBox(a, width, height)),
              style,
            ).finally(() => setBusy(false));
          }}
        >
          Download safe image{total ? ` (${total} area${total === 1 ? '' : 's'})` : ''}
        </button>
      </div>
      <div className="small muted">The original capture stays unchanged on this computer.</div>
    </section>
  );
}
