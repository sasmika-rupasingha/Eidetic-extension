/** Stores Visual Memory links in both directions after a capture is processed or refined. */
import { getCapture, listCaptures, updateCapture } from '../store/captures';
import { findRelated, mergeRelations, prepare, relate } from './related';

export async function linkRelated(id: string): Promise<void> {
  const target = await getCapture(id);
  if (!target || target.processing !== 'done') return;
  const all = await listCaptures();
  const found = findRelated(target, all);
  await updateCapture(id, (c) => void (c.relations = mergeRelations(c.relations, found)));
  // The other side: each linked capture links back, with the reason from its own point of view.
  const pt = prepare(target);
  for (const l of found) {
    await updateCapture(l.id, (o) => {
      if (o.relations.some((r) => r.id === id && (r.removed || r.by !== 'rules'))) return;
      const back = relate(prepare(o), pt);
      if (!back) return;
      o.relations = [...o.relations.filter((r) => r.id !== id), { id, reason: back.reason, by: 'rules' }];
    });
  }
}

/** "Not related": hides the link on both captures for good. */
export async function removeRelation(a: string, b: string): Promise<void> {
  const mark = (from: string, to: string) =>
    updateCapture(from, (c) => {
      const cur = c.relations.find((r) => r.id === to);
      c.relations = cur ? c.relations.map((r) => (r.id === to ? { ...r, removed: true } : r)) : [...c.relations, { id: to, reason: '', by: 'user', removed: true }];
    });
  await mark(a, b);
  await mark(b, a);
}
