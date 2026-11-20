/** Image helpers that work in the background worker and in extension pages (OffscreenCanvas, no DOM needed). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Converts a selection in CSS pixels of the viewport into pixels of the screenshot
 * (the screenshot is larger on high-DPI screens), clamped to the image.
 */
export function toImageRect(sel: Rect, viewport: { w: number; h: number }, image: { w: number; h: number }): Rect {
  const sx = image.w / viewport.w;
  const sy = image.h / viewport.h;
  const x = Math.max(0, Math.round(sel.x * sx));
  const y = Math.max(0, Math.round(sel.y * sy));
  const w = Math.max(1, Math.min(image.w - x, Math.round(sel.w * sx)));
  const h = Math.max(1, Math.min(image.h - y, Math.round(sel.h * sy)));
  return { x, y, w, h };
}

/** Size to draw an image so its longest side is at most `max`, keeping the aspect ratio. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Upscale factor for OCR: small text is read far better at about 2x. */
export const ocrScale = (w: number, h: number) => (Math.max(w, h) < 900 ? Math.min(3, 1800 / Math.max(w, h, 1)) : 1);

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [head, body = ''] = dataUrl.split(',', 2);
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);
export const mimeOf = (dataUrl: string) => /data:([^;]+)/.exec(dataUrl)?.[1] ?? 'image/png';

/** Crops a screenshot (data URL) to the selection and returns a PNG data URL. */
export async function cropScreenshot(screenshot: string, sel: Rect, viewport: { w: number; h: number }): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(await dataUrlToBlob(screenshot));
  const r = toImageRect(sel, viewport, { w: bmp.width, h: bmp.height });
  const canvas = new OffscreenCanvas(r.w, r.h);
  canvas.getContext('2d')!.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  bmp.close();
  return { dataUrl: await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' })), w: r.w, h: r.h };
}

/** Small JPEG thumbnail for the history list. */
export async function thumbnail(dataUrl: string, max = 360): Promise<string> {
  const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const s = fitWithin(bmp.width, bmp.height, max);
  const canvas = new OffscreenCanvas(s.w, s.h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, s.w, s.h);
  ctx.drawImage(bmp, 0, 0, s.w, s.h);
  bmp.close();
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
}

/** Scales an image down so cloud models get a reasonable size (long side 1600 px). */
export async function shrinkForModel(dataUrl: string, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
  if (Math.max(bmp.width, bmp.height) <= max) {
    bmp.close();
    return dataUrl;
  }
  const s = fitWithin(bmp.width, bmp.height, max);
  const canvas = new OffscreenCanvas(s.w, s.h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, s.w, s.h);
  bmp.close();
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

export async function imageDataOf(dataUrl: string): Promise<ImageData> {
  const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
