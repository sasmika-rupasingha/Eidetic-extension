/** Choosing an area inside the panel, for pages that refuse the on-page overlay (Chrome's PDF viewer and similar). */
import { useRef, useState } from 'react';
import { blobToDataUrl, thumbnail } from '../../shared/image';
import { getImage, replaceImage, updateCapture, type Capture } from '../../store/captures';

type Box = { x: number; y: number; w: number; h: number };

export function CropPicker({ capture, imgUrl, onDone }: { capture: Capture; imgUrl: string | null; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, r.width)), y: Math.max(0, Math.min(e.clientY - r.top, r.height)) };
  };

  const apply = async (whole: boolean) => {
    setBusy(true);
    try {
      if (whole || !box || !ref.current) {
        await updateCapture(capture.id, (c) => void (c.needsCrop = false));
      } else {
        const r = ref.current.getBoundingClientRect();
        const blob = await getImage(capture.image.blobId);
        if (!blob) return;
        const bmp = await createImageBitmap(blob);
        const sx = bmp.width / r.width;
        const sy = bmp.height / r.height;
        const w = Math.max(1, Math.round(box.w * sx));
        const h = Math.max(1, Math.round(box.h * sy));
        const canvas = new OffscreenCanvas(w, h);
        canvas.getContext('2d')!.drawImage(bmp, Math.round(box.x * sx), Math.round(box.y * sy), w, h, 0, 0, w, h);
        bmp.close();
        const out = await canvas.convertToBlob({ type: 'image/png' });
        await replaceImage(capture.id, out, w, h, await thumbnail(await blobToDataUrl(out), 320));
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="croppick">
      <div className="note accent small">This page doesn’t allow the on-page selector. Drag on the picture below to choose the area.</div>
      <div
        ref={ref}
        className="croppick-stage"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const p = pos(e);
          start.current = p;
          setBox({ ...p, w: 0, h: 0 });
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = pos(e);
          const s = start.current;
          setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
        }}
        onPointerUp={() => (start.current = null)}
      >
        {imgUrl ? <img src={imgUrl} alt="The whole screen; drag to choose an area" draggable={false} /> : null}
        {box && box.w > 4 && box.h > 4 ? <div className="croppick-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : null}
      </div>
      <div className="btn-row two">
        <button type="button" className="btn" disabled={busy} onClick={() => void apply(true)}>
          Use the whole screen
        </button>
        <button type="button" className="btn primary" disabled={busy || !box || box.w < 8 || box.h < 8} onClick={() => void apply(false)}>
          Use this area
        </button>
      </div>
    </div>
  );
}
