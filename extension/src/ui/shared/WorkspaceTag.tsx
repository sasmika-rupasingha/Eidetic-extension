/** A workspace's colour dot and name, and a select to move a capture into a workspace. */
import { assignCaptures, type Workspace } from '../../store/workspaces';

export function WsDot({ color }: { color: Workspace['color'] }) {
  return <span className="ws-dot" data-color={color} aria-hidden="true" />;
}

export function WorkspaceSelect({ id, value, workspaces, onChange, label = 'Workspace' }: { id: string; value: string; workspaces: Workspace[]; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="field ws-select">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No workspace</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export const moveTo = (ids: string[], workspaceId: string) => assignCaptures(ids, workspaceId || null);
