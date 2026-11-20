import { beforeEach, describe, expect, it, vi } from 'vitest';

const recognize = vi.fn(async (_image: string, langs: string[]) => ({
  text: langs.includes('sin') ? 'ආයුබෝවන් Hello' : '??? Hello',
  confidence: 80,
  lines: [],
  width: 10,
  height: 10,
  langs,
}));
vi.mock('../src/ocr/ocr', () => ({ recognize }));
vi.mock('../src/ocr/qr', () => ({ readQr: async () => null }));

const { processCapture, readingLanguages, rereadCapture } = await import('../src/capture/pipeline');
const { addCapture, getCapture, resetDbForTests, updateCapture } = await import('../src/store/captures');
const { validateSettings } = await import('../src/store/settings');

const src = { url: 'https://example.org/slide', title: 'Slide', site: 'example.org' };

describe('reading a capture again in another language', () => {
  beforeEach(async () => {
    recognize.mockClear();
    await resetDbForTests();
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase('eidetic');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });

  it('pairs a chosen language with English, and falls back to English for unknown codes', () => {
    expect(readingLanguages('sin')).toEqual(['sin', 'eng']);
    expect(readingLanguages('eng')).toEqual(['eng']);
    expect(readingLanguages('klingon')).toEqual(['eng']);
  });

  it('reads with the Settings languages first, then with the languages chosen for this capture only', async () => {
    const s = validateSettings({ ocrLanguages: ['eng'] });
    const cap = await addCapture({ image: new Blob(['x'], { type: 'image/png' }), w: 10, h: 10, thumb: '', source: src });
    const first = await processCapture(cap.id, s);
    expect(recognize).toHaveBeenLastCalledWith(expect.any(String), ['eng'], undefined);
    expect(first?.ocr?.text).toBe('??? Hello');

    await updateCapture(cap.id, (c) => void (c.ai = { description: 'An English slide', keywords: ['slide'] }));
    const marked = await rereadCapture(cap.id, 'sin');
    expect(marked?.processing).toBe('new');
    expect(marked?.ocrLangs).toEqual(['sin', 'eng']);
    expect(marked?.ai).toEqual({}); // the old description described the old text

    const again = await processCapture(cap.id, s);
    expect(recognize).toHaveBeenLastCalledWith(expect.any(String), ['sin', 'eng'], undefined);
    expect(again?.processing).toBe('done');
    expect(again?.ocr?.text).toContain('ආයුබෝවන්');
    expect(again?.ocr?.langs).toEqual(['sin', 'eng']);
    expect(again?.detection).toBeTruthy();

    // Other captures keep using the Settings languages.
    const other = await addCapture({ image: new Blob(['y'], { type: 'image/png' }), w: 10, h: 10, thumb: '', source: src });
    await processCapture(other.id, s);
    expect(recognize).toHaveBeenLastCalledWith(expect.any(String), ['eng'], undefined);
    expect((await getCapture(other.id))?.ocrLangs).toBeUndefined();
  });
});
