import { useMemo, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import Picker from '../ui/Picker';
import ColorSwatches from '../ui/ColorSwatches';
import ProviderDisclosure from './ProviderDisclosure';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import agents from '../../actions/agents';
import meta from '../../lib/meta';
import urlHost from '../../lib/urlHost';
import type Agent from '../../types/Agent';
import type AgentInput from '../../types/AgentInput';
import type AgentOptions from '../../types/AgentOptions';
import type AgentRunner from '../../types/AgentRunner';

const RUNNERS: { value: AgentRunner; label: string; hint: string }[] = [
  { value: 'external', label: 'External', hint: 'Connects over MCP or the REST API' },
  { value: 'anthropic', label: 'Built in: Anthropic', hint: 'Runs inside Nil on Claude' },
  { value: 'openai', label: 'Built in: OpenAI-compatible', hint: 'Ollama, vLLM, LM Studio, OpenRouter' },
];

const ACCESS = [
  { value: 'read', label: 'Read only' },
  { value: 'write', label: 'Read and write' },
];

const numberOrNull = (text: string) => (text.trim() === '' ? null : Number(text));
const textOf = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

interface Props {
  agent?: Agent;
  options: AgentOptions;
  onSaved: (agent: Agent, key: string | null) => void;
  onCancel: () => void;
}

// Adding or editing an agent. Limits left empty use the workspace defaults shown as placeholders.
export default function AgentForm({ agent, options, onSaved, onCancel }: Props) {
  const projectMap = useStore((s) => s.projects);
  const projects = useMemo(() => Object.values(projectMap).filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })), [projectMap]);
  const o = agent?.overrides;
  const [form, setForm] = useState({
    name: agent?.name ?? '',
    color: agent?.color ?? meta.palette[4].value,
    description: agent?.description ?? '',
    instructions: agent?.instructions ?? '',
    access: agent?.access ?? ('write' as 'read' | 'write'),
    allProjects: agent?.allProjects ?? false,
    projectIds: agent?.projectIds ?? [],
    tools: agent?.tools ?? options.tools.map((t) => t.name),
    runner: agent?.runner ?? ('external' as AgentRunner),
    model: agent?.runner === 'anthropic' && agent.model === options.defaults.model ? '' : agent?.model ?? '',
    endpoint: agent?.endpoint ?? '',
    apiKey: '',
    clearApiKey: false,
    doneStatus: o?.doneStatus ?? '',
    maxSteps: textOf(o?.maxSteps),
    maxRunTokens: textOf(o?.maxRunTokens),
    maxDayTokens: textOf(o?.maxDayTokens),
    rateLimit: textOf(o?.rateLimit),
    priceIn: textOf(o?.priceIn),
    priceOut: textOf(o?.priceOut),
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const builtIn = form.runner !== 'external';
  const statusOptions = [{ value: '', label: `Default (${options.defaults.doneStatus === 'none' ? 'leave it' : meta.status[options.defaults.doneStatus]})` }, ...meta.statuses.map((s) => ({ value: s, label: meta.status[s] })), { value: 'none', label: 'Leave the status as it is' }];
  const readTools = options.tools.filter((t) => !t.write);
  const writeTools = options.tools.filter((t) => t.write);
  const toggleTool = (name: string) => set({ tools: form.tools.includes(name) ? form.tools.filter((t) => t !== name) : [...form.tools, name] });
  const endpointHost = urlHost(form.endpoint);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input: Partial<AgentInput> = {
      name: form.name.trim(),
      color: form.color,
      description: form.description,
      instructions: form.instructions,
      access: form.access,
      allProjects: form.allProjects,
      projectIds: form.projectIds,
      tools: form.tools,
      runner: form.runner,
      model: form.model,
      endpoint: form.runner === 'openai' ? form.endpoint : '',
      doneStatus: (form.doneStatus || null) as AgentInput['doneStatus'],
      maxSteps: numberOrNull(form.maxSteps),
      maxRunTokens: numberOrNull(form.maxRunTokens),
      maxDayTokens: numberOrNull(form.maxDayTokens),
      rateLimit: numberOrNull(form.rateLimit),
      priceIn: numberOrNull(form.priceIn),
      priceOut: numberOrNull(form.priceOut),
    };
    if (form.apiKey.trim()) input.apiKey = form.apiKey.trim();
    else if (form.clearApiKey) input.apiKey = '';
    setSaving(true);
    try {
      if (agent) onSaved((await agents.update(agent.id, input)).agent, null);
      else {
        const res = await agents.create(input);
        onSaved(res.agent, res.key);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-card" onSubmit={submit} aria-label={agent ? `Edit ${agent.name}` : 'Add an agent'}>
      <div className="agent-form-grid">
        <label className="field">
          <span>Name</span>
          <input className="input" value={form.name} maxLength={60} required onChange={(e) => set({ name: e.target.value })} placeholder="Triage" />
          <small>People @mention and assign it by this name.</small>
        </label>
        <label className="field">
          <span>Short description</span>
          <input className="input" value={form.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} placeholder="Sorts new bug reports" />
        </label>
      </div>
      <div className="field">
        <span>Avatar colour</span>
        <ColorSwatches value={form.color} onChange={(color) => set({ color })} />
      </div>
      <label className="field">
        <span>Instructions</span>
        <textarea className="textarea" rows={4} value={form.instructions} maxLength={8000} onChange={(e) => set({ instructions: e.target.value })} placeholder="What this agent is for, how it should work and when it should ask a person." />
        <small>A built-in agent follows these on every run. Task text can never override them.</small>
      </label>

      <div className="agent-form-grid">
        <div className="field">
          <span>Access</span>
          <Picker title="Access" options={ACCESS} value={form.access} onChange={(v) => set({ access: v as 'read' | 'write' })} className="btn" width={200}>
            {form.access === 'write' ? 'Read and write' : 'Read only'}
          </Picker>
        </div>
        <div className="field">
          <span>Projects</span>
          <div className="settings-row">
            <label className="filter-toggle">
              <button type="button" className="toggle" role="switch" aria-checked={form.allProjects} onClick={() => set({ allProjects: !form.allProjects })} aria-label="All projects" />
              <span>All projects</span>
            </label>
            {!form.allProjects && (
              <Picker title="Projects it works in" multi options={projects} value={form.projectIds} onChange={(id) => set({ projectIds: form.projectIds.includes(id) ? form.projectIds.filter((x) => x !== id) : [...form.projectIds, id] })} className="btn" width={260}>
                {form.projectIds.length ? `${form.projectIds.length} project${form.projectIds.length === 1 ? '' : 's'}` : 'Pick projects'}
              </Picker>
            )}
          </div>
          <small>It also sees tasks assigned to it. Changes outside its projects wait for approval.</small>
        </div>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>Tools it may use</span>
        <div className="agent-tools">
          {[...readTools, ...writeTools].map((t) => (
            <label key={t.name} title={t.description}>
              <input type="checkbox" checked={form.tools.includes(t.name)} disabled={t.write && form.access === 'read'} onChange={() => toggleTool(t.name)} />
              <code>{t.name}</code>
            </label>
          ))}
        </div>
        <small>Writing tools need write access. Deleting, cancelling, giving work to people and bulk changes always wait for a person.</small>
      </fieldset>

      <div className="agent-form-grid">
        <div className="field">
          <span>How it runs</span>
          <Picker title="How it runs" options={RUNNERS.map((r) => ({ ...r, hint: r.value === 'anthropic' && !options.anthropicAvailable ? 'Needs ANTHROPIC_API_KEY on the server' : r.hint }))} value={form.runner} onChange={(v) => set({ runner: v as AgentRunner })} className="btn" width={300}>
            {RUNNERS.find((r) => r.value === form.runner)?.label}
          </Picker>
        </div>
        {form.runner === 'external' && (
          <label className="field">
            <span>Requests per minute</span>
            <input className="input" inputMode="numeric" value={form.rateLimit} onChange={(e) => set({ rateLimit: e.target.value })} placeholder={String(options.defaults.rateLimit)} />
          </label>
        )}
      </div>

      {form.runner === 'anthropic' && (
        <label className="field">
          <span>Model</span>
          <input className="input mono" value={form.model} maxLength={120} onChange={(e) => set({ model: e.target.value })} placeholder={options.defaults.model} />
        </label>
      )}
      {form.runner === 'openai' && (
        <div className="agent-form-grid">
          <label className="field">
            <span>Endpoint URL</span>
            <input className="input mono" value={form.endpoint} maxLength={500} required onChange={(e) => set({ endpoint: e.target.value })} placeholder="http://localhost:11434/v1" />
            {!options.allowLocalEndpoints && <small>Local and private addresses need AGENT_ALLOW_LOCAL_ENDPOINTS=true on the server.</small>}
          </label>
          <label className="field">
            <span>Model</span>
            <input className="input mono" value={form.model} maxLength={120} required onChange={(e) => set({ model: e.target.value })} placeholder="llama3.1:8b" />
          </label>
          <div className="field">
            <span>API key</span>
            <input className="input mono" type="password" autoComplete="off" aria-label="API key" value={form.apiKey} maxLength={500} onChange={(e) => set({ apiKey: e.target.value, clearApiKey: false })} placeholder={agent?.hasApiKey ? 'Saved. Type to replace it.' : 'Only if the endpoint needs one'} />
            {agent?.hasApiKey && (
              <label className="filter-toggle">
                <input type="checkbox" checked={form.clearApiKey} onChange={(e) => set({ clearApiKey: e.target.checked, apiKey: '' })} /> <span>Remove the saved key</span>
              </label>
            )}
          </div>
        </div>
      )}

      {builtIn && (
        <>
          <div className="agent-form-grid">
            <div className="field">
              <span>When it finishes assigned work</span>
              <Picker title="Status when done" options={statusOptions} value={form.doneStatus} onChange={(v) => set({ doneStatus: v })} className="btn" width={260}>
                {statusOptions.find((s) => s.value === form.doneStatus)?.label}
              </Picker>
            </div>
            <label className="field">
              <span>Steps per run</span>
              <input className="input" inputMode="numeric" value={form.maxSteps} onChange={(e) => set({ maxSteps: e.target.value })} placeholder={String(options.defaults.maxSteps)} />
            </label>
            <label className="field">
              <span>Tokens per run</span>
              <input className="input" inputMode="numeric" value={form.maxRunTokens} onChange={(e) => set({ maxRunTokens: e.target.value })} placeholder={String(options.defaults.maxRunTokens)} />
            </label>
            <label className="field">
              <span>Tokens per day</span>
              <input className="input" inputMode="numeric" value={form.maxDayTokens} onChange={(e) => set({ maxDayTokens: e.target.value })} placeholder={String(options.defaults.maxDayTokens)} />
            </label>
          </div>
          <div className="agent-form-grid">
            <label className="field">
              <span>Input price, $ per million tokens</span>
              <input className="input" inputMode="decimal" value={form.priceIn} onChange={(e) => set({ priceIn: e.target.value })} placeholder={form.runner === 'anthropic' ? String(options.defaults.priceIn) : '0'} />
            </label>
            <label className="field">
              <span>Output price, $ per million tokens</span>
              <input className="input" inputMode="decimal" value={form.priceOut} onChange={(e) => set({ priceOut: e.target.value })} placeholder={form.runner === 'anthropic' ? String(options.defaults.priceOut) : '0'} />
              <small>Only for the cost estimate in Settings.</small>
            </label>
          </div>
        </>
      )}

      <ProviderDisclosure runner={form.runner} host={endpointHost} />

      <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
          <Save /> {agent ? 'Save changes' : 'Add agent'}
        </button>
      </div>
    </form>
  );
}
