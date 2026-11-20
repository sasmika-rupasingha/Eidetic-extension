import { resetDbForTests } from '../src/store/captures';

/** A fresh, empty library database for each test. */
export async function freshDb(): Promise<void> {
  await resetDbForTests();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase('eidetic');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
}

export const blob = (s = 'x') => new Blob([s], { type: 'image/png' });
export const SRC = { url: 'https://example.org/a', title: 'A', site: 'example.org' };
