import sql from '../../db/sql.js';
import config from '../../config.js';
import parseJSON from '../../lib/parseJSON.js';
import tools from '../../mcp/tools.js';
import loadTask from '../../services/loadTask.js';
import canSeeTask from '../../services/canSeeTask.js';
import addComment from '../../services/addComment.js';
import agentPrincipal from '../agentPrincipal.js';
import agentBlocked from '../agentBlocked.js';
import actingContext from '../actingContext.js';
import runTool from '../runTool.js';
import pendingText from '../pendingText.js';
import secretBox from '../secretBox.js';
import audit from '../audit.js';
import providerFor from './providerFor.js';
import systemPrompt from './systemPrompt.js';
import briefing from './briefing.js';
import stepLog from './stepLog.js';
import publishRun from './publishRun.js';
import tokensToday from './tokensToday.js';
import runComment from './runComment.js';
import runnerTools from './runnerTools.js';
import checklistDone from './checklistDone.js';
import ProviderError from './ProviderError.js';
import log from '../../lib/log.js';

const RESULT_CAP = 20_000;
const RETRY_BASE_MS = 30_000;
const byName = new Map(tools.map((t) => [t.name, t]));

const toolset = ({ agent, scope }) => runnerTools(tools.filter((t) => agent.tools.includes(t.name) && (!t.write || scope === 'write')));
const refusalText = (refused) => refused.map((r) => `Not ticked: “${r.text}”, because ${r.reason}.`).join('\n');

function resultText(out) {
  if (out.ok) {
    const text = JSON.stringify(out.data);
    return text.length > RESULT_CAP ? `${text.slice(0, RESULT_CAP)}… (cut off; ask for less)` : text;
  }
  if (out.pending) return pendingText(out.pending);
  return `Error (${out.error.code}): ${out.error.message}`;
}

function knownSecrets(agent) {
  const hook = sql.get('SELECT secret_ct FROM agent_webhooks WHERE agent_id = ?', agent.id);
  const open = (sealed) => {
    try {
      return sealed ? secretBox.open(sealed) : null;
    } catch {
      return null;
    }
  };
  return [open(agent.apiKeyCt), open(hook?.secret_ct)];
}

// One run of a built-in agent on one task: brief the model, let it work through its tools in a
// bounded loop, then leave a comment and, for assigned work it finished, move the task on.
// Bounded by steps, tokens per run and per day, and wall-clock time. Transient model errors
// put the run back in the queue with a growing delay; anything else ends it with a comment.
export default async function executeRun(row, signal) {
  const run = { ...row, context: parseJSON(row.context, {}) };
  const log = stepLog(run.id);
  const finish = (status, { summary = null, error = null } = {}) => {
    sql.run('UPDATE agent_runs SET status = ?, finished_at = ?, summary = ?, error = ? WHERE id = ?', status, Date.now(), summary, error, run.id);
    publishRun(run.id);
  };

  const principal = agentPrincipal(run.agent_id);
  const blocked = agentBlocked(principal?.agent);
  if (blocked) {
    log.add('note', { output: blocked.message, ok: false });
    return finish('canceled', { error: blocked.message });
  }
  const { agent, user } = principal;
  const task = run.task_id ? loadTask(run.task_id) : null;
  if (!task || task.deletedAt || !canSeeTask(task, user)) {
    const message = 'The task is gone or no longer within this agent’s reach.';
    log.add('note', { output: message, ok: false });
    return finish('canceled', { error: message });
  }
  const acting = { agentId: agent.id, actingFor: run.acting_for, runId: run.id, via: 'runner' };
  const comment = (text) => {
    actingContext.run(acting, () => addComment(user, task.id, text));
    audit({ agentId: agent.id, actingFor: run.acting_for, via: 'runner', action: 'run_comment', taskId: task.id, runId: run.id, outcome: 'ok' });
  };

  const usedElsewhere = tokensToday(agent.id) - run.input_tokens - run.output_tokens;
  if (usedElsewhere >= agent.limits.maxDayTokens) {
    const message = 'This agent has used its tokens for today, so it didn’t start. An admin can raise the daily limit in Settings → Agents.';
    log.add('note', { output: message, ok: false });
    comment(message);
    return finish('failed', { error: message });
  }

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error('time limit')), config.agents.runTimeoutMs);
  const abort = AbortSignal.any([signal, deadline.signal]);
  const usage = { input: run.input_tokens, output: run.output_tokens };
  const pending = [];
  // checklist items ticked in this run, with what the agent produced for each
  const done = [];
  let changes = 0;
  let final = '';
  let stop = null;

  try {
    const provider = providerFor.get(agent);
    const brief = briefing(run, task, { attempt: run.attempts });
    log.add('brief', { input: { model: provider.model, attempt: run.attempts }, output: brief.text });
    if (brief.suspicious) log.add('guard', { output: 'Some text on this task reads like instructions aimed at the agent. It was passed on as content only.', ok: false });
    const state = provider.start({ system: systemPrompt(agent), user: brief.text, tools: toolset(principal) });

    for (let step = 0; step < agent.limits.maxSteps && !stop; step++) {
      const turn = await provider.step(state, { signal: abort, maxTokens: config.agents.maxOutputTokens });
      usage.input += turn.usage.input;
      usage.output += turn.usage.output;
      // 0 when the agent has no prices: Settings then shows token counts only
      const cost = agent.price ? (usage.input / 1e6) * agent.price.in + (usage.output / 1e6) * agent.price.out : 0;
      sql.run('UPDATE agent_runs SET input_tokens = ?, output_tokens = ?, cost = ? WHERE id = ?', usage.input, usage.output, cost, run.id);
      log.add('model', { input: turn.usage, output: turn.text || (turn.calls.length ? `Calls ${turn.calls.map((c) => c.name).join(', ')}` : '(no text)') });

      if (turn.stop === 'refusal') {
        final = turn.text;
        stop = 'refusal';
      } else if (!turn.calls.length) {
        final = turn.text;
        stop = turn.stop === 'max_tokens' ? 'max_tokens' : 'done';
      } else if (turn.stop === 'max_tokens') {
        // a tool call cut off at the length limit may parse as a smaller, wrong one: never run it
        stop = 'max_tokens';
      } else {
        const results = [];
        for (const call of turn.calls) {
          if (call.input === null || typeof call.input !== 'object' || Array.isArray(call.input)) {
            log.add('tool', { tool: call.name, input: call.error ?? call.input, output: 'The arguments weren’t a valid JSON object.', ok: false });
            results.push({ id: call.id, content: JSON.stringify({ INVALID_JSON: String(call.error ?? '').slice(0, 2000) }), isError: true });
            continue;
          }
          // a checklist item is ticked only with the work for it; the rest of the call goes ahead
          const guarded = call.name === 'update_task' ? checklistDone(call.input, user) : null;
          for (const r of guarded?.refused ?? []) log.add('guard', { tool: call.name, input: { item: r.text }, output: `Didn’t tick “${r.text}”: ${r.reason}.`, ok: false });
          if (guarded && !guarded.input) {
            results.push({ id: call.id, content: `${refusalText(guarded.refused)}\nPut the work in your reply and attach it as the result, or leave the item open.`, isError: true });
            continue;
          }
          const out = runTool(principal, call.name, guarded?.input ?? call.input, { via: 'runner', runId: run.id, actingFor: run.acting_for });
          // a write that turned out to change nothing (changed: false) isn't counted
          if (out.ok && byName.get(call.name)?.write && out.data?.changed !== false) changes += 1;
          if (out.ok && guarded) done.push(...guarded.accepted.filter((a) => !done.some((d) => d.id === a.id)));
          if (out.pending) pending.push(out.pending);
          log.add(out.pending ? 'approval' : out.ok ? 'tool' : 'refused', { tool: call.name, input: call.input, output: resultText(out), ok: out.ok || Boolean(out.pending) });
          const refusals = guarded?.refused.length ? `\n${refusalText(guarded.refused)}` : '';
          results.push({ id: call.id, content: resultText(out) + refusals, isError: !out.ok && !out.pending });
        }
        provider.addResults(state, results);
        const total = usage.input + usage.output;
        if (total >= agent.limits.maxRunTokens) stop = 'run_tokens';
        else if (usedElsewhere + total >= agent.limits.maxDayTokens) stop = 'day_tokens';
        else if (step === agent.limits.maxSteps - 1) stop = 'max_steps';
      }
      if (abort.aborted) break;
    }
  } catch (err) {
    if (signal.aborted) {
      const reason = signal.reason?.message ?? 'Cancelled.';
      log.add('note', { output: reason, ok: false });
      clearTimeout(timer);
      return finish('canceled', { error: reason });
    }
    if (!deadline.signal.aborted) {
      clearTimeout(timer);
      if (err instanceof ProviderError && err.transient && run.attempts <= config.agents.retries) {
        const wait = Math.round(RETRY_BASE_MS * 2 ** (run.attempts - 1) * (0.5 + Math.random() / 2));
        log.add('error', { output: `${err.message} Trying again in ${Math.ceil(wait / 1000)} s.`, ok: false });
        sql.run("UPDATE agent_runs SET status = 'queued', run_after = ?, error = ? WHERE id = ?", Date.now() + wait, err.message, run.id);
        return publishRun(run.id);
      }
      const message = err instanceof ProviderError ? err.message : 'The agent stopped on an unexpected error.';
      if (!(err instanceof ProviderError)) log.error('agents', `run ${run.id} failed`, err);
      log.add('error', { output: message, ok: false });
      comment(runComment({ text: `I couldn’t finish this: ${message}`, stop: null, changes, pending, done, checklist: loadTask(task.id)?.checklist ?? [], agent, secrets: knownSecrets(agent) }));
      return finish('failed', { error: message });
    }
  }
  clearTimeout(timer);
  if (signal.aborted) {
    const reason = signal.reason?.message ?? 'Cancelled.';
    log.add('note', { output: reason, ok: false });
    return finish('canceled', { error: reason });
  }
  if (deadline.signal.aborted) stop = 'timeout';

  // Finished assigned work moves on to review (or whatever the admin chose), unless something
  // still waits for approval or the task changed hands meanwhile.
  const triggers = (run.context.triggers ?? []).map((t) => t.type);
  const now = loadTask(task.id);
  if (stop === 'done' && !pending.length && triggers.includes('assigned') && agent.doneStatus !== 'none' && now && now.assigneeId === agent.id && !['done', 'canceled', agent.doneStatus].includes(now.status)) {
    const out = runTool(principal, 'update_task', { key: `${task.number}`, status: agent.doneStatus }, { via: 'runner', runId: run.id, actingFor: run.acting_for });
    log.add(out.ok ? 'tool' : 'refused', { tool: 'update_task', input: { status: agent.doneStatus }, output: resultText(out), ok: out.ok });
    if (out.ok && out.data.changed) changes += 1;
  }

  const secrets = knownSecrets(agent);
  comment(runComment({ text: final, stop, changes, pending, done, checklist: loadTask(task.id)?.checklist ?? [], agent, secrets }));
  const summary = runComment({ text: final, stop: null, changes, pending: [], done, agent, secrets }).slice(0, 2000);
  return finish(stop === 'done' ? 'done' : 'stopped', { summary, error: stop === 'done' ? null : stop });
}
