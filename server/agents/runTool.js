import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import tools from '../mcp/tools.js';
import agentBlocked from './agentBlocked.js';
import actingContext from './actingContext.js';
import validateArgs from './validateArgs.js';
import toolGuard from './toolGuard.js';
import NeedsApproval from './NeedsApproval.js';
import createApproval from './createApproval.js';
import audit from './audit.js';

const byName = new Map(tools.map((t) => [t.name, t]));

const CODES = { 400: 'invalid_request', 401: 'unauthorized', 402: 'plan_required', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' };

const failure = (status, code, message) => ({ ok: false, error: { status, code, message } });

// The audit trail links a call to the task it named, so admins can filter by task later.
function taskIdOf(key) {
  const number = Number(String(key ?? '').trim().split('-').pop());
  return Number.isInteger(number) && number > 0 ? sql.get('SELECT id FROM tasks WHERE number = ?', number)?.id ?? null : null;
}

// One tool call from MCP, the REST API, the built-in runner or an approved request: the single
// place that decides whether it may run. People act through their own keys with that key's
// access; agents also need the tool on their allowlist, must not be paused or switched off, and
// park risky changes as approval cards. Every agent call lands in its audit trail.
export default function runTool(principal, name, args, { via, runId = null, actingFor = null, approvedBy = null } = {}) {
  const { user, scope, agent } = principal;
  const record = (outcome, detail = {}, taskId = null) => {
    if (agent) audit({ agentId: agent.id, actingFor, via, action: name, taskId: taskId ?? taskIdOf(args?.key), runId, outcome, detail: { args, ...detail } });
  };

  const tool = byName.get(name);
  if (!tool) {
    record('denied', { reason: 'unknown tool' });
    return failure(404, 'unknown_tool', `There’s no tool called ${name}.`);
  }
  if (agent) {
    const blocked = agentBlocked(agent);
    if (blocked) {
      record('denied', { reason: blocked.code });
      return failure(blocked.status, blocked.code, blocked.message);
    }
    if (!agent.tools.includes(name)) {
      record('denied', { reason: 'not on allowlist' });
      return failure(403, 'tool_not_allowed', `This agent isn’t allowed to use ${name}. An admin can add it in Settings → Agents.`);
    }
  }
  if (tool.write && scope !== 'write') {
    record('denied', { reason: 'read-only' });
    return failure(403, 'read_only', agent ? 'This agent is read-only. An admin can give it write access in Settings → Agents.' : 'This key is read-only. Create a key with write access in Nil settings to change things.');
  }

  let input;
  try {
    input = validateArgs(tool.inputSchema, args);
  } catch (err) {
    record('error', { error: err.message });
    return failure(400, 'invalid_arguments', err.message);
  }

  const ctx = { user, scope, agent, via, guard: toolGuard(agent, { approved: Boolean(approvedBy) }) };
  try {
    const data = actingContext.run({ agentId: agent?.id ?? null, actingFor, runId, via }, () => tool.run(input, ctx));
    record('ok', approvedBy ? { approvedBy } : {});
    return { ok: true, data };
  } catch (err) {
    if (err instanceof NeedsApproval) {
      const approval = createApproval(principal, name, input, err.reasons, { taskId: err.taskId, runId, actingFor });
      record('pending_approval', { approvalId: approval.id, reasons: err.reasons }, approval.taskId);
      return { ok: false, pending: approval };
    }
    if (err instanceof HttpError) {
      record('error', { error: err.message });
      return failure(err.status, CODES[err.status] ?? 'error', err.message);
    }
    console.error('[agents] tool failed', name, err);
    record('error', { error: 'server error' });
    return failure(500, 'server_error', 'Something went wrong on the Nil server.');
  }
}
