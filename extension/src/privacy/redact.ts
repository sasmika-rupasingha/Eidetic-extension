/** Makes a safe copy of a capture's image: chosen areas are blacked out or pixelated. The original is unchanged. */
import type { Box } from '../detect/table';

export async function redactImage(image: Blob, boxes: Box[], style: 'black' | 'pixelate' = 'black'): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  for (const b of boxes) {
    const pad = Math.max(2, Math.round((b.y1 - b.y0) * 0.15));
    const x = Math.max(0, Math.floor(b.x0 - pad));
    const y = Math.max(0, Math.floor(b.y0 - pad));
    const w = Math.min(bmp.width - x, Math.ceil(b.x1 - b.x0 + pad * 2));
    const h = Math.min(bmp.height - y, Math.ceil(b.y1 - b.y0 + pad * 2));
    if (w <= 0 || h <= 0) continue;
    if (style === 'black') {
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, w, h);
    } else {
      // Pixelate: draw the area tiny, then scale it back up without smoothing.
      const cell = Math.max(6, Math.round(h / 3));
      const tw = Math.max(1, Math.round(w / cell));
      const th = Math.max(1, Math.round(h / cell));
      const tmp = new OffscreenCanvas(tw, th);
      tmp.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    }
  }
  bmp.close();
  return c.convertToBlob({ type: 'image/png' });
}
