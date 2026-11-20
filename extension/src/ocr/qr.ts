import jsQR from 'jsqr';
import { imageDataOf } from '../shared/image';

/** Reads a QR code in the snip, if there is one. */
export async function readQr(dataUrl: string): Promise<string | null> {
  try {
    const img = await imageDataOf(dataUrl);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    return hit?.data?.trim() || null;
  } catch {
    return null;
  }
}
