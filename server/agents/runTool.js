import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import tools from '../mcp/tools.js';
import agentBlocked from './agentBlocked.js';
import actingContext from './actingContext.js';
import validateArgs from './validateArgs.js';
import toolGuard from './toolGuard.js';
import NeedsApproval from './NeedsApproval.js';
import createApproval from './createApproval.js';
import audit from './audit.js';
import taskIdOfKey from './taskIdOfKey.js';
import log from '../lib/log.js';
import changesSomething from './changesSomething.js';

const byName = new Map(tools.map((t) => [t.name, t]));

const CODES = { 400: 'invalid_request', 401: 'unauthorized', 402: 'plan_required', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' };

const failure = (status, code, message) => ({ ok: false, error: { status, code, message } });

// One tool call from MCP, the REST API, the built-in runner or an approved request: the single
// place that decides whether it may run. People act through their own keys with that key's
// access; agents also need the tool on their allowlist, must not be paused or switched off, and
// park risky changes as approval cards. Every agent call lands in its audit trail. The result
// names the task the call was about (`taskId`), for the logs that keep what it said.
export default function runTool(principal, name, args, { via, runId = null, actingFor = null, approvedBy = null } = {}) {
  const { user, scope, agent } = principal;
  const named = taskIdOfKey(args?.key);
  const record = (outcome, detail = {}, taskId = named) => {
    if (agent) audit({ agentId: agent.id, actingFor, via, action: name, taskId, runId, outcome, detail: { args, ...detail } });
  };
  const fail = (status, code, message) => ({ ...failure(status, code, message), taskId: named });

  const tool = byName.get(name);
  if (!tool) {
    record('denied', { reason: 'unknown tool' });
    return fail(404, 'unknown_tool', `There’s no tool called ${name}.`);
  }
  if (agent) {
    const blocked = agentBlocked(agent);
    if (blocked) {
      record('denied', { reason: blocked.code });
      return fail(blocked.status, blocked.code, blocked.message);
    }
  }
  if (changesSomething(tool) && scope !== 'write') {
    record('denied', { reason: 'read-only' });
    return fail(403, 'read_only', agent ? 'This agent is read-only. An admin can give it write access in Settings → Agents.' : 'This key is read-only. Create a key with write access in Nil settings to change things.');
  }
  if (agent && !agent.tools.includes(name)) {
    record('denied', { reason: 'not on allowlist' });
    return fail(403, 'tool_not_allowed', `This agent isn’t allowed to use ${name}. An admin can add it in Settings → Agents.`);
  }

  let input;
  try {
    input = validateArgs(tool.inputSchema, args);
  } catch (err) {
    record('error', { error: err.message });
    return fail(400, 'invalid_arguments', err.message);
  }

  const ctx = { user, scope, agent, via, guard: toolGuard(agent, { approved: Boolean(approvedBy) }) };
  try {
    const data = actingContext.run({ agentId: agent?.id ?? null, actingFor, runId, via }, () => tool.run(input, ctx));
    // a task the call created is named in its answer
    const taskId = named ?? taskIdOfKey(data?.created?.key);
    record('ok', approvedBy ? { approvedBy } : {}, taskId);
    return { ok: true, data, taskId };
  } catch (err) {
    if (err instanceof NeedsApproval) {
      // a stuck or misbehaving agent can't bury the people who approve under cards
      if (sql.get("SELECT COUNT(*) AS n FROM agent_approvals WHERE agent_id = ? AND status = 'pending'", agent.id).n >= config.agents.maxPendingApprovals) {
        record('denied', { reason: 'too many pending approvals', reasons: err.reasons });
        return fail(429, 'too_many_approvals', `${config.agents.maxPendingApprovals} of this agent’s requests are already waiting for approval. Wait until people have decided them.`);
      }
      const approval = createApproval(principal, name, input, err.reasons, { taskId: err.taskId, runId, actingFor });
      record('pending_approval', { approvalId: approval.id, reasons: err.reasons }, approval.taskId);
      return { ok: false, pending: approval, taskId: approval.taskId };
    }
    if (err instanceof HttpError) {
      record('error', { error: err.message });
      return fail(err.status, CODES[err.status] ?? 'error', err.message);
    }
    log.error('agents', `tool ${name} failed`, err);
    record('error', { error: 'server error' });
    return fail(500, 'server_error', 'Something went wrong on the Nil server.');
  }
}
