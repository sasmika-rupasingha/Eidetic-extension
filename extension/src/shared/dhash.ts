/**
 * Perceptual hash (dHash): the image shrunk to 9 × 8 grey pixels; each bit says whether a pixel is brighter than its
 * right-hand neighbour. Similar images have hashes a few bits apart. 64 bits → 16 hex digits. No dependency.
 */

/** dHash of a 9 × 8 greyscale image (72 values, row by row). */
export function dhashFromGray(gray: ArrayLike<number>): string {
  if (gray.length !== 72) throw new Error('dHash needs 9 × 8 grey values.');
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (gray[y * 9 + x]! > gray[y * 9 + x + 1]! ? 1 : 0);
      if (++bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  return hex;
}

/** Greyscale (ITU-R BT.601 luma) of RGBA pixels. */
export function toGray(rgba: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) out.push(0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!);
  return out;
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Number of differing bits between two hashes (64 when either is missing or malformed). */
export function hamming(a: string | undefined, b: string | undefined): number {
  if (!a || !b || !/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    d += POP[x]!;
  }
  return d;
}

/** dHash of an image file (works in extension pages and the background: OffscreenCanvas). */
export async function dhashBlob(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(9, 8);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 9, 8);
  bmp.close();
  return dhashFromGray(toGray(ctx.getImageData(0, 0, 9, 8).data));
}

/** SHA-256 of a file, for telling exact duplicates from look-alikes. */
export async function sha256(blob: Blob): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
