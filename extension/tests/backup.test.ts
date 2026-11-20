import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeImage, exportBackup, importBackup, parseBackup, reportLine, stripSecrets, validateCapture } from '../src/store/backup';
import { addCapture, getCapture, getImage, listCaptures, updateCapture } from '../src/store/captures';
import { listRecords } from '../src/store/records';
import { defaultSettings, loadSettings, saveSettings } from '../src/store/settings';
import { createWorkspace } from '../src/store/workspaces';
import { createNotebook } from '../src/study/notebook';
import { freshDb, SRC } from './helpers';

// chrome.storage.local for settings, in memory.
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (k: string) => ({ [k]: store[k] }),
      set: async (o: Record<string, unknown>) => void Object.assign(store, o),
    },
    onChanged: { addListener: () => undefined, removeListener: () => undefined },
  },
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const png = (extra = 0) => new Blob([PNG, new Uint8Array([extra])], { type: 'image/png' });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('validating backup records', () => {
  it('checks that images are what they claim to be', () => {
    expect(decodeImage(b64(PNG), 'image/png')?.bytes.length).toBe(PNG.length);
    expect(decodeImage(b64(PNG), 'image/jpeg')).toBeNull();
    expect(decodeImage(b64(new TextEncoder().encode('<svg onload=alert(1)>....')), 'image/png')).toBeNull();
    expect(decodeImage('not base64!', 'image/png')).toBeNull();
    expect(decodeImage(b64(PNG), 'text/html')).toBeNull();
  });
  it('cleans a hostile capture and works out detection again', () => {
    const c = validateCapture({
      id: 'x1',
      number: 3,
      createdAt: 5,
      status: 'kept',
      source: { url: 'javascript:alert(1)', title: 'T', site: 's' },
      video: { time: 4, title: 'v', url: 'https://youtube.com/watch?v=a', resumeUrl: 'javascript:x' },
      image: { w: 10, h: 10, thumb: 'javascript:alert(1)' },
      ocr: { text: "ModuleNotFoundError: No module named 'pandas'", langs: ['eng', 'xx'], confidence: 500, lines: [{ text: 'x', bbox: { x0: 0, y0: 0, x1: 'a', y1: 1 } }] },
      detection: { category: 'evil', label: '<img src=x>' },
      privacy: { findings: [{ kind: 'nope' }] },
      notes: 'n',
      ai: { description: 'd', keywords: ['a', 1], model: 'm' },
      answers: [{ text: 'a', label: 'l', model: 'm', at: 1 }, 'junk'],
      relations: [{ id: 'y', reason: 'r', by: 'evil' }, { id: '../../etc' }],
      hash: 'not-a-hash',
      embedding: { model: 'openai:x', vector: [1] },
    })!;
    expect(c.source.url).toBe('');
    expect(c.video?.resumeUrl).toBeUndefined();
    expect(c.image.thumb).toBe('');
    expect(c.ocr?.langs).toEqual(['eng']);
    expect(c.ocr?.confidence).toBe(100);
    expect(c.ocr?.lines).toEqual([]);
    expect(c.detection?.category).toBe('error');
    expect(c.privacy?.findings).toEqual([]);
    expect(c.ai.keywords).toEqual(['a']);
    expect(c.answers).toHaveLength(1);
    expect(c.relations).toEqual([{ id: 'y', reason: 'r', by: 'rules' }]);
    expect(c.hash).toBeUndefined();
    expect(c.embedding).toBeUndefined();
    expect(validateCapture({ id: 'x', image: { w: 0, h: 1 } })).toBeNull();
    expect(validateCapture({ id: '<script>', image: { w: 1, h: 1 } })).toBeNull();
  });
  it('rejects files that are not Eidetic backups', () => {
    expect(() => parseBackup('nope')).toThrow(/not JSON/);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/isn’t an Eidetic backup/);
    expect(() => parseBackup('{"format":"eidetic-backup","version":99}')).toThrow(/newer version/);
    const p = parseBackup(JSON.stringify({ format: 'eidetic-backup', version: 1, captures: [{ id: 'a', image: { w: 1, h: 1 }, imageData: 'xx', imageMime: 'image/png' }, 'junk'], workspaces: [{ id: 'w', name: '' }] }));
    expect(p.captures).toEqual([]);
    expect(p.invalid).toBe(3);
  });
  it('never keeps API keys', () => {
    const s = defaultSettings();
    s.providers.openai.apiKey = 'sk-secret';
    expect(JSON.stringify(stripSecrets(s))).not.toContain('sk-secret');
  });
});

describe('backup round trip', () => {
  beforeEach(async () => {
    await freshDb();
    for (const k of Object.keys(store)) delete store[k];
  });
  it('exports everything without keys, then restores it into an empty library', async () => {
    const s = defaultSettings();
    s.providers.gemini.apiKey = 'AIza-secret-key';
    s.theme = 'dark';
    await saveSettings(s);
    const ws = await createWorkspace({ name: 'Thesis' });
    await createNotebook('Cards');
    const a = await addCapture({ image: png(1), w: 4, h: 4, thumb: '', source: SRC });
    await updateCapture(a.id, (c) => {
      c.processing = 'done';
      c.ocr = { text: 'Hello world from a slide', langs: ['eng'], confidence: 90, lines: [] };
      c.notes = 'my note';
      c.workspaceId = ws.id;
      c.hash = '0123456789abcdef';
    });
    const b = await addCapture({ image: png(2), w: 4, h: 4, thumb: '', source: SRC });

    const { blob, counts } = await exportBackup('3.0.0');
    const text = await blob.text();
    expect(counts).toEqual({ captures: 2, workspaces: 1, notebooks: 1, monitors: 0 });
    expect(text).not.toContain('AIza-secret-key');

    await freshDb();
    const parsed = parseBackup(text);
    const r = await importBackup(parsed, { restoreSettings: true });
    expect(r.added).toEqual({ captures: 2, workspaces: 1, notebooks: 1, monitors: 0 });
    expect(reportLine(r)).toMatch(/^Added 2 captures, 1 workspace, 1 notebook\./);
    const back = (await getCapture(a.id))!;
    expect(back).toMatchObject({ number: a.number, notes: 'my note', workspaceId: ws.id, hash: '0123456789abcdef' });
    expect(new Uint8Array(await (await getImage(back.image.blobId))!.arrayBuffer())).toEqual(new Uint8Array(await png(1).arrayBuffer()));
    expect((await getCapture(b.id))?.processing).toBe('new');
    expect((await loadSettings()).theme).toBe('dark');
    expect((await loadSettings()).providers.gemini.apiKey).toBe('AIza-secret-key'); // kept from this computer, never from the file

    // Importing again adds nothing.
    const again = await importBackup(parseBackup(text));
    expect(again.added.captures).toBe(0);
    expect(again.skipped).toEqual({ captures: 2, workspaces: 1, notebooks: 1, monitors: 0 });
    expect(await listCaptures()).toHaveLength(2);
    expect(await listRecords('workspaces')).toHaveLength(1);
  });
  it('skips a copy of an existing image and renumbers when a number is taken', async () => {
    const mine = await addCapture({ image: png(1), w: 4, h: 4, thumb: '', source: SRC });
    await updateCapture(mine.id, (c) => void (c.hash = 'aaaaaaaaaaaaaaaa'));
    const file = (id: string, hash: string, extra: number) => ({ id, number: mine.number, image: { w: 4, h: 4 }, hash, imageMime: 'image/png', imageData: b64(new Uint8Array([...PNG, extra])) });
    const r = await importBackup(parseBackup(JSON.stringify({ format: 'eidetic-backup', version: 1, captures: [file('copy', 'aaaaaaaaaaaaaaaa', 1), file('new', 'bbbbbbbbbbbbbbbb', 9)] })));
    expect(r.added.captures).toBe(1);
    expect(r.skipped.captures).toBe(1);
    expect((await getCapture('new'))?.number).toBe(mine.number + 1);
  });
});
