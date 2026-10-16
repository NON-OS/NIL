import '../components/proofs/Proofs.css';
import { useEffect, useState } from 'react';
import NilLogo from '../components/brand/NilLogo';
import StatusIcon from '../components/ui/StatusIcon';
import Spinner from '../components/ui/Spinner';
import Markdown from '../components/ui/Markdown';
import http from '../api/http';
import meta from '../lib/meta';
import dates from '../lib/dates';
import type Status from '../types/Status';

type Line = { key: string; title: string; status: Status; due: string | null };
type View =
  | { kind: 'project'; workspace: string; project: { name: string; key: string; color: string }; counts: { total: number; done: number }; tasks: Line[] }
  | { kind: 'task'; workspace: string; task: Line & { description: string; checklist: { done: number; total: number }; bounty: string | null } };

// The public, read-only page behind a share link. Works without signing in.
export default function SharePage({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    http.get<View>(`/public/share/${encodeURIComponent(token)}`).then(setView).catch((err) => setError(err instanceof Error ? err.message : 'This link doesn’t work.'));
  }, [token]);

  const row = (t: Line) => (
    <div key={t.key} className="proof-row" style={{ gridTemplateColumns: '22px 84px minmax(0, 1fr) auto' }}>
      <StatusIcon status={t.status} size={15} />
      <span className="ref mono muted">{t.key}</span>
      <span className="title">{t.title}</span>
      <span className="date muted num" style={{ fontSize: 'var(--text-sm)' }}>{t.due ? dates.short(t.due) : meta.status[t.status]}</span>
    </div>
  );

  return (
    <div className="verify-standalone">
      <header>
        <NilLogo height={42} />
        <span className="eyebrow">Read-only share</span>
      </header>
      <div className="page page-narrow">
        {error ? (
          <div className="auth-error">{error}</div>
        ) : !view ? (
          <Spinner size={20} />
        ) : view.kind === 'project' ? (
          <>
            <span className="eyebrow">{view.workspace}</span>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 500, margin: '6px 0 4px' }}>{view.project.name}</h1>
            <p className="muted" style={{ marginBottom: 16 }}>
              {view.counts.done} of {view.counts.total} tasks done
            </p>
            <div className="panel">{view.tasks.map(row)}</div>
          </>
        ) : (
          <>
            <span className="eyebrow">
              {view.workspace} · {view.task.key}
            </span>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 500, margin: '6px 0 8px' }}>{view.task.title}</h1>
            <p className="muted" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusIcon status={view.task.status} size={15} /> {meta.status[view.task.status]}
              {view.task.due && ` · due ${dates.short(view.task.due)}`}
              {view.task.checklist.total > 0 && ` · ${view.task.checklist.done}/${view.task.checklist.total} steps`}
              {view.task.bounty && ` · ${view.task.bounty} bounty`}
            </p>
            {view.task.description && (
              <div className="panel">
                <div className="panel-body">
                  <Markdown text={view.task.description} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
