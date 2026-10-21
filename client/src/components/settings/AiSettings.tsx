import { useEffect, useState, type FormEvent } from 'react';
import { Bot, Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import accessKeys from '../../actions/accessKeys';
import identity from '../../actions/identity';
import dates from '../../lib/dates';
import PlanNotice from '../plan/PlanNotice';
import type AccessKey from '../../types/AccessKey';
import HelpLink from '../help/HelpLink';
import AnonymousAiCard from './AnonymousAiCard';
import AiProviderCard from './AiProviderCard';
import isAdminUser from '../../lib/isAdmin';
import aiDestination from '../../lib/aiDestination';

// every key expires, at most a year out unless the server allows less
const EXPIRY = [
  { value: '30', label: 'Expires in 30 days' },
  { value: '90', label: 'Expires in 90 days' },
  { value: '365', label: 'Expires in a year' },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Copied.', { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the text and copy it.', { tone: 'error' });
  }
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="snippet">
      <div className="snippet-head">
        <span className="eyebrow">{label}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(text)}>
          <Copy /> Copy
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

// Connect Claude or any MCP-capable assistant to this workspace with a personal key. The
// assistant acts as you and sees exactly what you see, never more.
export default function AiSettings() {
  const aiOn = useStore((s) => s.ai);
  const provider = useStore((s) => s.aiProvider);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [form, setForm] = useState({ name: 'Claude', scope: 'read' as 'read' | 'write', expiry: '90' });
  const [fresh, setFresh] = useState<string | null>(null);
  const endpoint = `${location.origin}/mcp`;
  const shown = fresh ?? 'nonos_pat_…';

  useEffect(() => {
    accessKeys.list().then(setKeys).catch(toast.error);
  }, []);

  // a key outlives this session, so a wallet that's already linked signs off on it first
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await identity.confirm();
      const res = await accessKeys.create({ name: form.name.trim(), scope: form.scope, days: Number(form.expiry) });
      setFresh(res.token);
      setKeys(res.tokens);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <section className="settings-section">
        <h2>
          Connect your AI assistant <HelpLink topic="ai-assistants" label="How AI assistants connect" />
        </h2>
        <p>
          Nil speaks the Model Context Protocol, so Claude and other assistants can read your tasks, create them and post updates for you. The assistant uses a personal key, acts as you, and sees exactly what you see. Other people’s private tasks and encrypted docs are never reachable.
        </p>
        <form className="settings-card" onSubmit={create}>
          <div className="settings-row">
            <input className="input" style={{ flex: '1 1 180px' }} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Key name" placeholder="Name, like Claude Code" />
            <Picker title="Access" options={[{ value: 'read', label: 'Read only' }, { value: 'write', label: 'Read and write' }]} value={form.scope} onChange={(v) => setForm({ ...form, scope: v as 'read' | 'write' })} className="btn" width={200}>
              {form.scope === 'read' ? 'Read only' : 'Read and write'}
            </Picker>
            <Picker title="Expiry" options={EXPIRY} value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} className="btn" width={220}>
              {EXPIRY.find((o) => o.value === form.expiry)?.label}
            </Picker>
            <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
              <KeyRound /> Create key
            </button>
          </div>
          {fresh && (
            <div className="key-once" role="status">
              <Check size={16} />
              <div>
                <strong>Copy this key now. It won’t be shown again.</strong>
                <code className="mono">{fresh}</code>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => copy(fresh)}>
                <Copy /> Copy
              </button>
            </div>
          )}
        </form>
      </section>

      <section className="settings-section">
        <h2>Set it up</h2>
        <div className="settings-card">
          <Snippet label="Claude Code" text={`claude mcp add --transport http nonos ${endpoint} \\\n  --header "Authorization: Bearer ${shown}"`} />
          <Snippet label="Claude Code project file (.mcp.json) or Cursor (.cursor/mcp.json)" text={JSON.stringify({ mcpServers: { nonos: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${shown}` } } } }, null, 2)} />
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            VS Code, the Claude app and claude.ai take the same address and key in their own formats; the help page on AI agents shows each. ChatGPT can’t use a key, so it can’t connect. Then ask things like “What’s overdue in Nil?”, “Create a task for Ana to draft the launch post, due Friday” or “Summarise NON-12”. The same tools are a REST API too, described at /api/agent/v1/openapi.json. To give an AI its own place on the team instead of acting as you, add it in Settings → Agents.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h2>Your keys</h2>
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {keys.length === 0 && <p className="muted">No keys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
              <Bot size={16} />
              <div style={{ minWidth: 0 }}>
                <div className="member-name">{k.name}</div>
                <div className="member-sub">
                  {k.scope === 'write' ? 'Read and write' : 'Read only'} · created {dates.short(dates.toISO(new Date(k.createdAt)))}
                  {` · ${k.expiresAt < Date.now() ? 'expired' : `expires ${dates.short(dates.toISO(new Date(k.expiresAt)))}`}`}
                  {k.lastUsedAt ? ` · last used ${dates.ago(k.lastUsedAt)}` : ' · never used'}
                </div>
              </div>
              <div className="member-actions">
                <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => accessKeys.revoke(k.id).then(setKeys).catch(toast.error)} confirmLabel="Revoke?">
                  <Trash2 /> Revoke
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Built-in AI</h2>
        <PlanNotice what="AI tools" />
        <div className="settings-card">
          <p style={{ margin: 0 }}>
            {aiOn && provider
              ? `Built-in AI is on: break tasks into steps, write descriptions, turn notes into tasks, draft docs, write deck narratives and weekly briefs. ${aiDestination(provider)} Only the text a feature needs is sent, and only when someone clicks it.`
              : `Built-in AI is off. ${isAdmin ? 'Choose a provider and add the workspace’s own key below to turn it on.' : 'An admin can turn it on here by choosing a provider and adding the workspace’s own key.'} Connecting your own assistant above works either way.`}
          </p>
        </div>
        {isAdmin && <AiProviderCard />}
        {aiOn && <AnonymousAiCard />}
      </section>
    </>
  );
}
