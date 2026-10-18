import '../components/proofs/Proofs.css';
import { BadgeCheck } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import VerifyPanel from '../components/proofs/VerifyPanel';
import NilLogo from '../components/brand/NilLogo';
import router from '../lib/router';

// Works signed in (inside the app) or signed out (a standalone public page).
export default function VerifyView({ standalone = false }: { standalone?: boolean }) {
  const intro = (
    <p className="muted" style={{ marginBottom: 16, maxWidth: '62ch' }}>
      A Nil proof is a file of work receipts signed by the workspace that issued them. This page checks every signature and any revealed titles, so you know the work record is genuine and untouched.
    </p>
  );
  if (standalone) {
    return (
      <div className="verify-standalone">
        <header>
          <NilLogo height={42} />
          <a className="btn btn-sm" href="/" onClick={router.link('/')}>
            Sign in
          </a>
        </header>
        <main className="page page-narrow">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', marginBottom: 8 }}>
            <BadgeCheck /> Verify a proof of work
          </h1>
          {intro}
          <VerifyPanel />
        </main>
      </div>
    );
  }
  return (
    <div className="main">
      <ViewHeader title="Verify a proof" icon={<BadgeCheck size={17} />} />
      <div className="page page-narrow">
        {intro}
        <VerifyPanel />
      </div>
    </div>
  );
}
