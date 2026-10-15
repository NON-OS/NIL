import { Download, ShieldCheck } from 'lucide-react';
import useStore from '../../state/useStore';

export default function DataSettings() {
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const aiOn = useStore((s) => s.ai);

  return (
    <>
      <section className="settings-section">
        <h2>Your data</h2>
        <div className="settings-card">
          <div className="settings-row">
            <a className="btn" href="/api/export/tasks.csv">
              <Download /> Export tasks (CSV)
            </a>
            {isAdmin && (
              <a className="btn" href="/api/export/backup.json">
                <Download /> Full backup (JSON)
              </a>
            )}
          </div>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            The CSV opens in Excel, Numbers or Google Sheets. The backup includes projects, goals, comments and history, but never passwords or sessions.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h2>Privacy</h2>
        <div className="settings-card">
          <ul className="privacy-list">
            <li>
              <ShieldCheck /> Everything lives on your own server. NONOS has no analytics, trackers or third-party scripts, and loads no fonts or code from other sites.
            </li>
            <li>
              <ShieldCheck /> Passwords are hashed with scrypt. Sessions and invite links are stored only as hashes, so a copied database can’t be used to sign in.
            </li>
            <li>
              <ShieldCheck /> Only admins can see email addresses. Teammates see names.
            </li>
            <li>
              <ShieldCheck /> Deleted tasks stay in the trash for 30 days, then they and their files are erased. Deleted data is overwritten in the database file.
            </li>
            <li>
              <ShieldCheck /> Admins can remove someone’s access and then permanently delete their account.
            </li>
            <li>
              <ShieldCheck />
              {aiOn
                ? 'AI assist is on. When someone clicks an AI button, only the text that feature needs is sent to Anthropic’s API. Nothing is sent in the background.'
                : 'AI assist is off. No task data leaves your server.'}
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
