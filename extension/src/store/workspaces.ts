/** Workspaces (projects): a name, a colour from the accent set and a description; captures point to one by workspaceId. */
import { listCaptures, newId, updateCapture } from './captures';
import { deleteRecord, listRecords, putRecord, updateRecord } from './records';
import type { Accent } from './settings';

export const WS_COLORS: Accent[] = ['ultramarine', 'vermilion', 'moss', 'graphite'];
export const WS_COLOR_LABEL: Record<Accent, string> = { ultramarine: 'Blue', vermilion: 'Red', moss: 'Green', graphite: 'Graphite' };

export interface Workspace {
  id: string;
  name: string;
  color: Accent;
  description: string;
  createdAt: number;
}

/** Cleans a workspace from storage or an import; null when it isn't usable. */
export function validateWorkspace(raw: unknown): Workspace | null {
  const r = raw as Partial<Workspace> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 80) return null;
  const name = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  if (!name) return null;
  return {
    id: r.id,
    name,
    color: WS_COLORS.includes(r.color as Accent) ? (r.color as Accent) : 'ultramarine',
    description: typeof r.description === 'string' ? r.description.trim().slice(0, 600) : '',
    createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
  };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const all = (await listRecords<unknown>('workspaces')).map(validateWorkspace).filter((w): w is Workspace => Boolean(w));
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createWorkspace(input: { name: string; color?: Accent; description?: string }): Promise<Workspace> {
  const w = validateWorkspace({ id: `ws-${newId()}`, createdAt: Date.now(), ...input });
  if (!w) throw new Error('Give the workspace a name.');
  return putRecord('workspaces', w);
}

export const editWorkspace = (id: string, patch: Partial<Omit<Workspace, 'id' | 'createdAt'>>) =>
  updateRecord<Workspace>('workspaces', id, (w) => validateWorkspace({ ...w, ...patch }) ?? w);

/** Deletes a workspace; its captures stay in the library without a workspace. */
export async function deleteWorkspace(id: string): Promise<void> {
  for (const c of await listCaptures()) if (c.workspaceId === id) await updateCapture(c.id, (x) => void delete x.workspaceId);
  await deleteRecord('workspaces', id);
}

/** Puts captures in a workspace (or takes them out with null). */
export async function assignCaptures(ids: string[], workspaceId: string | null): Promise<void> {
  for (const id of ids)
    await updateCapture(id, (c) => {
      if (workspaceId) c.workspaceId = workspaceId;
      else delete c.workspaceId;
    });
}
