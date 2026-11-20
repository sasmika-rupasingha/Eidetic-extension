import { beforeEach, describe, expect, it } from 'vitest';
import { addCapture, getCapture } from '../src/store/captures';
import { listRecords } from '../src/store/records';
import { assignCaptures, createWorkspace, deleteWorkspace, editWorkspace, listWorkspaces, validateWorkspace } from '../src/store/workspaces';
import { blob, freshDb, SRC } from './helpers';

describe('workspaces', () => {
  beforeEach(freshDb);
  it('validates names, colours and descriptions', () => {
    expect(validateWorkspace({ id: 'w', name: '  ' })).toBeNull();
    expect(validateWorkspace({ id: '', name: 'x' })).toBeNull();
    const w = validateWorkspace({ id: 'w', name: ' ML   module ', color: 'neon', description: 3, createdAt: 'x' })!;
    expect(w.name).toBe('ML module');
    expect(w.color).toBe('ultramarine');
    expect(w.description).toBe('');
    expect(typeof w.createdAt).toBe('number');
  });
  it('creates, lists by name, edits and deletes', async () => {
    const b = await createWorkspace({ name: 'Thesis', color: 'moss' });
    await createWorkspace({ name: 'Algorithms' });
    expect((await listWorkspaces()).map((w) => w.name)).toEqual(['Algorithms', 'Thesis']);
    await editWorkspace(b.id, { name: 'Thesis 2026', color: 'vermilion' });
    expect((await listWorkspaces()).find((w) => w.id === b.id)).toMatchObject({ name: 'Thesis 2026', color: 'vermilion' });
    await expect(createWorkspace({ name: '' })).rejects.toThrow(/name/);
  });
  it('assigns captures and keeps them when the workspace is deleted', async () => {
    const w = await createWorkspace({ name: 'Project' });
    const a = await addCapture({ image: blob(), w: 1, h: 1, thumb: '', source: SRC });
    const c = await addCapture({ image: blob(), w: 1, h: 1, thumb: '', source: SRC });
    await assignCaptures([a.id, c.id], w.id);
    expect((await getCapture(a.id))?.workspaceId).toBe(w.id);
    await assignCaptures([c.id], null);
    expect((await getCapture(c.id))?.workspaceId).toBeUndefined();
    await deleteWorkspace(w.id);
    expect(await getCapture(a.id)).toMatchObject({ id: a.id });
    expect((await getCapture(a.id))?.workspaceId).toBeUndefined();
    expect(await listRecords('workspaces')).toEqual([]);
  });
});
