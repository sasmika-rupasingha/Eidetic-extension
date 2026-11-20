/** Fills in the perceptual hash (dHash) of captures saved before v3, a few at a time. */
import { dhashBlob, sha256 } from '../shared/dhash';
import { getImage, listCaptures, updateCapture, type Capture } from './captures';

let running: Promise<number> | null = null;

export function backfillHashes(max = 200): Promise<number> {
  if (running) return running;
  running = (async () => {
    let n = 0;
    for (const c of (await listCaptures()).filter((x) => !x.hash && !x.needsCrop).slice(0, max)) {
      const blob = await getImage(c.image.blobId).catch(() => undefined);
      if (!blob) continue;
      const hash = await dhashBlob(blob).catch(() => undefined);
      if (!hash) continue;
      await updateCapture(c.id, (x) => void (x.hash = hash));
      n += 1;
    }
    return n;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Exact-content keys for the captures that could be identical (same dHash and same file size): SHA-256 of their
 * images. Others get no key, so they're never called identical.
 */
export async function exactKeys(caps: Capture[]): Promise<Map<string, string>> {
  const buckets = new Map<string, Capture[]>();
  for (const c of caps) if (c.hash) buckets.set(`${c.hash}:${c.image.bytes}`, [...(buckets.get(`${c.hash}:${c.image.bytes}`) ?? []), c]);
  const out = new Map<string, string>();
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      const blob = await getImage(c.image.blobId).catch(() => undefined);
      if (blob) out.set(c.id, await sha256(blob));
    }
  }
  return out;
}
