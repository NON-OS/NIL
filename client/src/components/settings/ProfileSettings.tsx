import { useState, type FormEvent } from 'react';
import ColorSwatches from '../ui/ColorSwatches';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import people from '../../actions/people';
import shortAddress from '../../lib/shortAddress';

export default function ProfileSettings() {
  const me = useStore((s) => s.me)!;
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (await people.updateMe({ name, title })) toast.show('Profile saved.', { tone: 'success' });
  };

  return (
    <>
      <section className="settings-section">
        <h2>Profile</h2>
        <form className="settings-card" onSubmit={saveProfile}>
          <div className="settings-row">
            <Avatar user={me} size={44} />
            <div>
              <div className="mono" style={{ fontWeight: 600 }} title={me.address ?? undefined}>{me.address ? shortAddress(me.address) : 'No wallet linked'}</div>
              <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>Your sign-in wallet. Only admins can see it.</div>
            </div>
          </div>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
          <label className="field">
            <span>Role on the team</span>
            <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Head of Growth" />
          </label>
          <div className="field">
            <span>Avatar color</span>
            <ColorSwatches value={me.color} onChange={(color) => people.updateMe({ color })} />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              Save profile
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
