/** Workspaces: create named projects, open one to see its captures and notes, rename or delete it. */
import { useState } from 'react';
import type { Capture } from '../../store/captures';
import { createWorkspace, deleteWorkspace, editWorkspace, WS_COLOR_LABEL, WS_COLORS, type Workspace } from '../../store/workspaces';
import type { Accent } from '../../store/settings';
import { CaptureRow, Dialog, Empty } from '../shared/components';
import { WsDot } from '../shared/WorkspaceTag';

function ColorPicker({ value, onChange, name }: { value: Accent; onChange: (c: Accent) => void; name: string }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Colour
      </legend>
      <div className="swatches">
        {WS_COLORS.map((c) => (
          <label key={c} className="swatch">
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} />
            <WsDot color={c} /> {WS_COLOR_LABEL[c]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function WorkspacesPage({ workspaces, captures, toast }: { workspaces: Workspace[] | null; captures: Capture[] | null; toast: (m: string) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<Accent>('ultramarine');
  const [description, setDescription] = useState('');
  const count = (id: string) => captures?.filter((c) => c.workspaceId === id).length ?? 0;
  return (
    <div className="ws-page">
      <div className="page-head">
        <div className="eyebrow">Projects</div>
        <h1 className="page-title">Workspaces</h1>
        <p className="page-intro">Group captures by course, project or topic. A capture belongs to one workspace; filter the library by it, or open a workspace to see its captures and notes together.</p>
      </div>
      {workspaces?.length ? (
        <div className="ws-cards">
          {workspaces.map((w) => (
            <a key={w.id} className="ws-card" href={`#/workspace/${w.id}`}>
              <span className="ws-card-name">
                <WsDot color={w.color} /> {w.name}
              </span>
              {w.description ? <span className="small muted">{w.description}</span> : null}
              <span className="meta">
                {count(w.id)} capture{count(w.id) === 1 ? '' : 's'}
              </span>
            </a>
          ))}
        </div>
      ) : workspaces ? (
        <Empty title="No workspaces yet">Create one below, then add captures to it from the library or a capture’s page.</Empty>
      ) : null}
      <form
        className="ws-section provider-form"
        aria-labelledby="new-ws-h"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return toast('Give the workspace a name');
          void createWorkspace({ name, color, description }).then((w) => {
            toast(`Workspace “${w.name}” created`);
            setName('');
            setDescription('');
          });
        }}
      >
        <h2 id="new-ws-h">New workspace</h2>
        <div className="field">
          <label htmlFor="ws-name">Name</label>
          <input id="ws-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Machine learning module" />
        </div>
        <ColorPicker value={color} onChange={setColor} name="new-ws-color" />
        <div className="field">
          <label htmlFor="ws-desc">Description (optional)</label>
          <textarea id="ws-desc" className="input" value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <button type="submit" className="btn primary">
            Create workspace
          </button>
        </div>
      </form>
    </div>
  );
}

export function WorkspaceDetail({ id, workspaces, captures, toast }: { id: string; workspaces: Workspace[] | null; captures: Capture[] | null; toast: (m: string) => void }) {
  const w = workspaces?.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState<{ name: string; color: Accent; description: string } | null>(null);
  if (!workspaces) return null;
  if (!w) return <p>This workspace no longer exists.</p>;
  const mine = (captures ?? []).filter((c) => c.workspaceId === w.id);
  const notes = mine.filter((c) => c.notes.trim());
  return (
    <div className="ws-page">
      <a href="#/workspaces" className="small">
        ‹ Workspaces
      </a>
      <div className="page-head">
        <div className="eyebrow row-gap">
          <WsDot color={w.color} /> Workspace
        </div>
        <h1 className="page-title" data-testid="ws-title">
          {w.name}
        </h1>
        {w.description ? <p className="page-intro">{w.description}</p> : null}
        <div className="row-gap wrap">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setDraft({ name: w.name, color: w.color, description: w.description });
              setEditing(true);
            }}
          >
            Edit
          </button>
          <button type="button" className="btn small ghost danger" onClick={() => setConfirm(true)}>
            Delete workspace…
          </button>
        </div>
      </div>
      {editing && draft ? (
        <form
          className="provider-form"
          onSubmit={(e) => {
            e.preventDefault();
            void editWorkspace(w.id, draft).then(() => {
              setEditing(false);
              toast('Saved');
            });
          }}
        >
          <div className="field">
            <label htmlFor="ws-edit-name">Name</label>
            <input id="ws-edit-name" className="input" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} name="edit-ws-color" />
          <div className="field">
            <label htmlFor="ws-edit-desc">Description</label>
            <textarea id="ws-edit-desc" className="input" value={draft.description} maxLength={600} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="row-gap">
            <button type="submit" className="btn primary small">
              Save
            </button>
            <button type="button" className="btn small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <section className="ws-section" aria-labelledby="ws-caps-h">
        <h2 id="ws-caps-h">
          Captures ({mine.length})
        </h2>
        {mine.length ? (
          <div className="lib-grid">
            {mine.map((c) => (
              <CaptureRow key={c.id} capture={c} onOpen={() => (location.hash = `/capture/${c.id}`)} />
            ))}
          </div>
        ) : (
          <Empty title="No captures here yet">In the library, select captures and choose this workspace, or pick it on a capture’s page.</Empty>
        )}
      </section>
      {notes.length ? (
        <section className="ws-section" aria-labelledby="ws-notes-h">
          <h2 id="ws-notes-h">Notes</h2>
          <ul className="plain">
            {notes.map((c) => (
              <li key={c.id}>
                <a href={`#/capture/${c.id}`}>{c.ai.description ?? c.detection?.description ?? 'Capture'}</a>: <span className="muted">{c.notes}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {confirm ? (
        <Dialog
          title={`Delete “${w.name}”?`}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void deleteWorkspace(w.id).then(() => {
                    toast('Workspace deleted');
                    location.hash = '/workspaces';
                  })
                }
              >
                Delete workspace
              </button>
            </>
          }
        >
          <p className="small">Its {mine.length} capture{mine.length === 1 ? '' : 's'} stay in the library without a workspace.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
