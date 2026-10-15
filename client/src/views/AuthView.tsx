import './AuthView.css';
import { useEffect, useState, type FormEvent } from 'react';
import Wordmark from '../components/ui/Wordmark';
import StatusIcon from '../components/ui/StatusIcon';
import Spinner from '../components/ui/Spinner';
import useStore from '../state/useStore';
import useRoute from '../hooks/useRoute';
import session from '../actions/session';
import http from '../api/http';

type Mode = 'login' | 'setup' | 'invite';

function Pitch() {
  return (
    <aside className="auth-side">
      <Wordmark size={22} />
      <div>
        <h2>Plan the work. Ship the work. Grow.</h2>
        <p>One place for your team’s tasks, goals and progress, updating live for everyone.</p>
        <div className="auth-flow" aria-hidden="true">
          <div><StatusIcon status="todo" size={16} /> Draft the Q3 growth plan</div>
          <div><StatusIcon status="in_progress" size={16} /> Launch referral program</div>
          <div><StatusIcon status="done" size={16} /> Hire first sales lead</div>
        </div>
      </div>
      <small style={{ opacity: 0.7 }}>Self-hosted. Your data stays on your server.</small>
    </aside>
  );
}

export default function AuthView() {
  const needsSetup = useStore((s) => s.needsSetup);
  const workspace = useStore((s) => s.workspace);
  const { segments } = useRoute();
  const inviteToken = segments[0] === 'invite' ? segments[1] : null;
  const mode: Mode = inviteToken ? 'invite' : needsSetup ? 'setup' : 'login';

  const [form, setForm] = useState({ workspaceName: 'NONOS', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ valid: boolean; email?: string | null; workspace?: { name: string } } | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    http
      .get<{ valid: boolean; email?: string | null; workspace?: { name: string } }>(`/auth/invite/${encodeURIComponent(inviteToken)}`)
      .then((info) => {
        setInvite(info);
        if (info.email) setForm((f) => ({ ...f, email: info.email! }));
      })
      .catch(() => setInvite({ valid: false }));
  }, [inviteToken]);

  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'setup') await session.setup(form);
      else if (mode === 'invite') await session.acceptInvite({ token: inviteToken!, ...form });
      else await session.login(form.email, form.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, [string, string]> = {
    login: [`Sign in to ${workspace.name}`, 'Welcome back.'],
    setup: ['Set up your workspace', 'You’re the first one here, so you’ll be the owner. You can invite your team next.'],
    invite: [`Join ${invite?.workspace?.name ?? 'your team'}`, 'Create your account to get started.'],
  };

  return (
    <div className="auth">
      <Pitch />
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h1>{titles[mode][0]}</h1>
          <p className="lead">{titles[mode][1]}</p>
          {mode === 'invite' && invite && !invite.valid ? (
            <div className="auth-error">This invite link has expired or was already used. Ask your admin for a new one.</div>
          ) : (
            <>
              {error && <div className="auth-error" role="alert">{error}</div>}
              {mode === 'setup' && (
                <label className="field">
                  <span>Workspace name</span>
                  <input className="input" required maxLength={60} autoComplete="organization" {...field('workspaceName')} />
                </label>
              )}
              {mode !== 'login' && (
                <label className="field">
                  <span>Your name</span>
                  <input className="input" required maxLength={80} autoComplete="name" autoFocus {...field('name')} />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" required autoComplete={mode === 'login' ? 'username' : 'email'} autoFocus={mode === 'login'} readOnly={mode === 'invite' && !!invite?.email} {...field('email')} />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" type="password" required minLength={mode === 'login' ? 1 : 10} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...field('password')} />
                {mode !== 'login' && <small>At least 10 characters. A short sentence works well.</small>}
              </label>
              <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                {busy && <Spinner size={14} />}
                {mode === 'login' ? 'Sign in' : mode === 'setup' ? 'Create workspace' : 'Join workspace'}
              </button>
              {mode === 'login' && <p className="auth-note">Need an account? Ask a workspace admin for an invite link.</p>}
            </>
          )}
        </form>
      </main>
    </div>
  );
}
