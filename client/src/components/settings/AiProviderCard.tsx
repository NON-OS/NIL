import { useEffect, useState, type FormEvent } from 'react';
import { PlugZap, Save, Trash2 } from 'lucide-react';
import Picker from '../ui/Picker';
import ConfirmButton from '../ui/ConfirmButton';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import aiProvider from '../../actions/aiProvider';
import type AiProviderKind from '../../types/AiProviderKind';
import type AiProviderInput from '../../types/AiProviderInput';
import type AiProviderSettings from '../../types/AiProviderSettings';
import type AiProviderTest from '../../types/AiProviderTest';

const KINDS: { value: AiProviderKind; label: string; hint: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'A key from the Claude Console' },
  { value: 'openai', label: 'OpenAI (GPT)', hint: 'A key from the OpenAI platform' },
  { value: 'compatible', label: 'OpenAI-compatible', hint: 'OpenRouter, Gemini, Groq, Mistral, a local model' },
];

type Form = { kind: AiProviderKind; baseUrl: string; model: string; apiKey: string };

const formOf = (s: AiProviderSettings | null): Form => ({ kind: s?.provider?.kind ?? 'anthropic', baseUrl: s?.provider?.baseUrl ?? '', model: s?.provider?.model ?? '', apiKey: '' });

// The workspace's own AI provider and key, admins only. Built-in AI and agents on the workspace's
// AI use it. The key goes to the server once, sealed there, and never comes back: the form shows
// only that one is saved and how it ends.
export default function AiProviderCard() {
  const [settings, setSettings] = useState<AiProviderSettings | null>(null);
  const [form, setForm] = useState<Form>(formOf(null));
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [result, setResult] = useState<AiProviderTest | null>(null);
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setResult(null);
  };
  const saved = settings?.provider;
  // the saved key only goes with the provider, and the address, it was saved for
  const keyFits = Boolean(saved?.keySet && saved.kind === form.kind && (form.kind !== 'compatible' || saved.baseUrl === form.baseUrl.trim()));
  const needsKey = form.kind !== 'compatible' && !keyFits && !form.apiKey.trim();

  useEffect(() => {
    aiProvider
      .get()
      .then((s) => {
        setSettings(s);
        setForm(formOf(s));
      })
      .catch(toast.error);
  }, []);

  const input = (): AiProviderInput => ({ kind: form.kind, baseUrl: form.kind === 'compatible' ? form.baseUrl.trim() : '', model: form.model.trim(), ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}) });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    try {
      const s = await aiProvider.save(input());
      setSettings(s);
      setForm(formOf(s));
      toast.show('Saved. Built-in AI now uses this provider.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      setResult(await aiProvider.test(input()));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    try {
      const s = await aiProvider.remove();
      setSettings(s);
      setForm(formOf(s));
      toast.show('Removed. The key is gone from this server.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  if (!settings) return null;
  return (
    <form className="settings-card" onSubmit={save} aria-label="AI provider" style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>AI provider</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Built-in AI runs on this workspace’s own key, with the provider you choose. Nil never adds a key of its own.
          {!saved && settings.serverDefault && ' Until you choose one, it uses the key this server’s operator set.'}
        </p>
      </div>
      {!settings.outbound && (
        <p className="hint" role="note" style={{ margin: 0 }}>
          This server has no route out to the internet yet, so nothing reaches the provider until its operator turns one on. You can save the provider now.
        </p>
      )}
      <div className="agent-form-grid">
        <div className="field">
          <span>Provider</span>
          <Picker title="Provider" options={KINDS} value={form.kind} onChange={(v) => set({ kind: v as AiProviderKind, apiKey: '' })} className="btn" width={320}>
            {KINDS.find((k) => k.value === form.kind)?.label}
          </Picker>
        </div>
        <label className="field">
          <span>Model</span>
          <input className="input mono" value={form.model} maxLength={120} required onChange={(e) => set({ model: e.target.value })} placeholder="The model’s name, as the provider lists it" />
        </label>
      </div>
      {form.kind === 'compatible' && (
        <label className="field">
          <span>Address</span>
          <input className="input mono" value={form.baseUrl} maxLength={500} required onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://…/v1" />
          <small>
            The provider’s OpenAI-compatible address, usually ending in /v1. Help → AI assistants lists the ones for OpenRouter, Gemini, Groq and Mistral.
            {!settings.allowLocalEndpoints && ' A model on this server or its network needs AGENT_ALLOW_LOCAL_ENDPOINTS=true.'}
          </small>
        </label>
      )}
      <label className="field">
        <span>API key</span>
        <input
          className="input mono"
          type="password"
          autoComplete="off"
          value={form.apiKey}
          maxLength={500}
          onChange={(e) => set({ apiKey: e.target.value })}
          placeholder={keyFits ? `Saved, ending ${saved?.keyTail ?? ''}. Type to replace it.` : form.kind === 'compatible' ? 'Only if the provider needs one' : 'Paste the key'}
        />
        <small>Sealed on the server and never shown again. Anyone with access to this server’s data folder and its key file could open it, so use a key you can revoke.</small>
      </label>
      {result && (
        <p role="status" className={result.ok ? 'muted' : 'hint'} style={{ margin: 0 }}>
          {result.ok ? `Connected. The model answered in ${(result.ms / 1000).toFixed(1)} s.` : result.error}
        </p>
      )}
      <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
        {saved && (
          <ConfirmButton className="btn btn-danger" onConfirm={remove} confirmLabel="Remove the provider and key?">
            <Trash2 /> Remove
          </ConfirmButton>
        )}
        <button type="button" className="btn" onClick={test} disabled={busy !== null || !form.model.trim() || needsKey || (form.kind === 'compatible' && !form.baseUrl.trim())}>
          {busy === 'test' ? <Spinner size={13} /> : <PlugZap />} Test connection
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy !== null || !form.model.trim() || needsKey}>
          {busy === 'save' ? <Spinner size={13} /> : <Save />} Save
        </button>
      </div>
    </form>
  );
}
