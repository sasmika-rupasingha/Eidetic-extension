/** Capture & Compare: the baseline vs the new capture, changes in categories, and the image difference overlay. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { changeLine, diffMask, summarizeChanges, type ChangeSummary } from '../../compare/changes';
import { formatNumber, getImage, type Capture } from '../../store/captures';
import { timeAgo } from './hooks';

export function ChangeList({ s }: { s: ChangeSummary }) {
  if (s.same) return <p className="small">No change in the text.</p>;
  return (
    <div className="changes" data-testid="change-list">
      {s.numbers.length ? (
        <div>
          <h3 className="h-section">Numbers changed</h3>
          <ul className="plain">
            {s.numbers.map((n, i) => (
              <li key={i}>
                {n.label ? <span className="muted">{n.label}: </span> : null}
                <del>{n.from}</del> → <ins>{n.to}</ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.changed.length ? (
        <div>
          <h3 className="h-section">Changed</h3>
          <ul className="plain">
            {s.changed.map((c, i) => (
              <li key={i}>
                <del>{c.from}</del> → <ins>{c.to}</ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.added.length ? (
        <div>
          <h3 className="h-section">Added</h3>
          <ul className="plain">
            {s.added.map((t, i) => (
              <li key={i}>
                <ins>{t}</ins>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.removed.length ? (
        <div>
          <h3 className="h-section">Removed</h3>
          <ul className="plain">
            {s.removed.map((t, i) => (
              <li key={i}>
                <del>{t}</del>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Draws the new image with the changed pixels marked; the old image is scaled to the new one's size first. */
function ImageDiff({ baseline, current }: { baseline: Capture; current: Capture }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [share, setShare] = useState<number | null>(null);
  const [show, setShow] = useState(true);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [ba, bb] = await Promise.all([getImage(baseline.image.blobId), getImage(current.image.blobId)]);
      if (!ba || !bb || !live || !canvas.current) return;
      const [ia, ib] = await Promise.all([createImageBitmap(ba), createImageBitmap(bb)]);
      const w = ib.width;
      const h = ib.height;
      const off = new OffscreenCanvas(w, h);
      const ctx = off.getContext('2d')!;
      ctx.drawImage(ia, 0, 0, w, h);
      const da = ctx.getImageData(0, 0, w, h).data;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, w, h).data;
      const { mask, changed } = diffMask(da, db, w, h);
      const c = canvas.current;
      c.width = w;
      c.height = h;
      const out = c.getContext('2d')!;
      out.drawImage(ib, 0, 0);
      if (show) {
        const layer = new OffscreenCanvas(w, h);
        layer.getContext('2d')!.putImageData(new ImageData(mask, w, h), 0, 0);
        out.drawImage(layer, 0, 0);
      }
      ia.close();
      ib.close();
      if (live) setShare(changed);
    })();
    return () => {
      live = false;
    };
  }, [baseline.image.blobId, current.image.blobId, show]);
  return (
    <div className="image-diff">
      <canvas ref={canvas} className="diff-canvas" role="img" aria-label={share === null ? 'Comparing the images…' : `The new capture, with ${Math.round(share * 100)}% of the image marked as changed`} />
      <div className="row-gap wrap small">
        <span data-testid="image-change">{share === null ? 'Comparing the images…' : share < 0.002 ? 'The images look the same.' : `${share < 0.01 ? 'Under 1' : Math.round(share * 100)}% of the image changed (marked in red).`}</span>
        <label className="check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show differences</span>
        </label>
      </div>
    </div>
  );
}

export function ChangesView({ baseline, current }: { baseline: Capture; current: Capture }) {
  const summary = useMemo(() => (baseline.ocr && current.ocr ? summarizeChanges(baseline.ocr.text, current.ocr.text) : null), [baseline.ocr, current.ocr]);
  return (
    <section className="compare-changes" aria-label="Changes since the earlier capture" data-testid="changes">
      <div className="eyebrow">Capture & Compare</div>
      <h2 className="h-section">
        Changes since{' '}
        <a href={chrome.runtime.getURL(`workspace.html#/capture/${baseline.id}`)} target="_blank" rel="noreferrer">
          {formatNumber(baseline.number)}
        </a>{' '}
        <span className="muted">({timeAgo(baseline.createdAt)})</span>
      </h2>
      {summary ? (
        <>
          <div className="small" data-testid="change-line">
            {changeLine(summary)}
          </div>
          <ChangeList s={summary} />
        </>
      ) : (
        <div className="small muted">Reading the text of both captures…</div>
      )}
      <ImageDiff baseline={baseline} current={current} />
    </section>
  );
}
