import { useState, type FormEvent } from 'react';
import useStore from '../../state/useStore';
import people from '../../actions/people';
import isAdminUser from '../../lib/isAdmin';

export default function WorkspaceSettings() {
  const workspace = useStore((s) => s.workspace);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [name, setName] = useState(workspace.name);
  const [prefix, setPrefix] = useState(workspace.taskPrefix);

  const save = (e: FormEvent) => {
    e.preventDefault();
    people.updateWorkspace({ name, taskPrefix: prefix });
  };

  return (
    <>
      <section className="settings-section">
        <h2>Workspace</h2>
        <form className="settings-card" onSubmit={save}>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} maxLength={60} disabled={!isAdmin} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Task key prefix</span>
            <input className="input mono" style={{ maxWidth: 140 }} value={prefix} maxLength={5} disabled={!isAdmin} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <small>
              Tasks are numbered like <span className="mono">{prefix || 'NON'}-42</span>. Changing it renames every key.
            </small>
          </label>
          {isAdmin ? (
            <div>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || !prefix}>
                Save workspace
              </button>
            </div>
          ) : (
            <p className="muted">Only admins can change workspace settings.</p>
          )}
        </form>
      </section>

      <section className="settings-section">
        <h2>Crypto tools</h2>
        <div className="settings-card">
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Bounties, votes and proof of work</strong>
              <br />
              <span className="muted">
                Pay people in tokens for finished tasks, decide things with wallet votes and give contributors signed records of their work. This also covers private payouts and letting token holders join without an invite. Turning it off hides all of it for everyone and deletes nothing.
              </span>
            </span>
            <button type="button" className="toggle" role="switch" aria-checked={workspace.cryptoTools} disabled={!isAdmin} onClick={() => people.updateWorkspace({ cryptoTools: !workspace.cryptoTools })} aria-label="Bounties, votes and proof of work" />
          </label>
        </div>
      </section>
    </>
  );
}
