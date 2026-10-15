import { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import ProjectModal from '../overlays/ProjectModal';
import useStore from '../../state/useStore';
import projectActions from '../../actions/projects';
import type Project from '../../types/Project';

export default function ProjectSettings() {
  const projectMap = useStore((s) => s.projects);
  const projects = useMemo(() => Object.values(projectMap).sort((a, b) => Number(a.archived) - Number(b.archived) || a.position - b.position), [projectMap]);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  return (
    <section className="settings-section">
      <h2>Projects</h2>
      <p>Archived projects disappear from the sidebar but keep their tasks and history.</p>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus /> New project
        </button>
      </div>
      {projects.length > 0 && (
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {projects.map((p) => (
            <div key={p.id} className={`member${p.archived ? ' off' : ''}`} style={{ gridTemplateColumns: '14px minmax(0, 1fr) auto' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: p.color }} />
              <div style={{ minWidth: 0 }}>
                <div className="member-name">{p.name}</div>
                <div className="member-sub">
                  <span className="mono">{p.key}</span>
                  {p.archived ? ' · Archived' : ''}
                </div>
              </div>
              <div className="member-actions">
                <button type="button" className="btn btn-sm" onClick={() => projectActions.update(p.id, { archived: !p.archived })}>
                  {p.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(p)}>
                  <Pencil /> Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <ProjectModal project={editing === 'new' ? undefined : projectMap[editing.id]} onClose={() => setEditing(null)} />}
    </section>
  );
}
