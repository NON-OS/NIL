import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import CapsuleCard from './CapsuleCard';
import RetentionCard from './RetentionCard';
import WipeCard from './WipeCard';
import useStore from '../../state/useStore';

export default function DataSettings() {
  const role = useStore((s) => s.me?.role);
  const aiOn = useStore((s) => s.ai);
  const sourceUrl = useStore((s) => s.sourceUrl);
  const isAdmin = role !== 'member';

  return (
    <>
      <section className="settings-section">
        <h2>Export and move</h2>
        <div className="settings-card">
          <div className="settings-row">
            <a className="btn" href="/api/export/tasks.csv">
              <Download /> Export tasks (CSV)
            </a>
            {isAdmin && (
              <a className="btn" href="/api/export/backup.json">
                <Download /> Readable backup (JSON)
              </a>
            )}
          </div>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>The CSV opens in any spreadsheet. The JSON backup is human-readable and never includes sessions or keys.</p>
        </div>
        {isAdmin && <CapsuleCard />}
      </section>

      <section className="settings-section">
        <h2>Zero-state</h2>
        <p>Keep only what you need. Old data is erased for good on the server’s hourly sweep.</p>
        <RetentionCard />
        {role === 'owner' && <WipeCard />}
      </section>

      <section className="settings-section">
        <h2>Privacy</h2>
        <div className="settings-card">
          <ul className="privacy-list">
            <li><ShieldCheck /> Everything lives on your own server. No analytics, trackers or third-party scripts, and no fonts or code loaded from other sites.</li>
            <li><ShieldCheck /> People sign in with an Ethereum wallet. NONOS never asks for an email, a phone number or a password.</li>
            <li><ShieldCheck /> Sessions and invite links are stored only as hashes, so a copied database can’t be used to sign in.</li>
            <li><ShieldCheck /> Only admins see wallet addresses. Teammates see the name each person picked.</li>
            <li><ShieldCheck /> Proofs of work hide task titles unless the contributor reveals them, and are checked without uploading anything.</li>
            <li><ShieldCheck /> Deleted data is overwritten in the database file. Trash is erased after 30 days.</li>
            <li><ShieldCheck />{aiOn ? 'AI assist is on. When someone clicks an AI button, only the text that feature needs goes to Anthropic’s API.' : 'AI assist is off. No task data leaves your server.'}</li>
          </ul>
        </div>
      </section>

      <section className="settings-section">
        <h2>Free software</h2>
        <div className="settings-card">
          <p style={{ color: 'var(--ink-2)' }}>
            NONOS is free and open source under the GNU Affero General Public License v3. You can run, study, change and share it. If you offer a modified version to others over a network, you must share your changes too.
          </p>
          {sourceUrl && (
            <a className="btn" href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ justifySelf: 'start' }}>
              <ExternalLink /> Source code
            </a>
          )}
        </div>
      </section>
    </>
  );
}
