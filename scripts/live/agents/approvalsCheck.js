// Risky requests from an external agent become approval cards: delete, cancel, give work to a
// person, bulk changes. A person approves one and declines one; the audit trail and the task
// history say who did what and for whom.
//
//   node approvalsCheck.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import openapiClient from './lib/openapiClient.js';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({ options: { state: { type: 'string', default: process.env.LIVE_STATE } } });
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('Approvals');
const owner = session(state.url, { cookie: state.people.owner.cookie });
const ana = session(state.url, { cookie: state.people.ana.cookie });
const api = await openapiClient(`${state.url}/api/agent/v1/openapi.json`, { key: state.agents.scout.key });
const idem = () => crypto.randomUUID();
const scoutId = state.agents.scout.id;
const newTask = async (title, who = owner, extra = {}) => (await who('POST', '/api/tasks', { title, projectId: state.projects.website, ...extra })).data.task;
const key = (task) => `NON-${task.number}`;

// each kind of risky request parks
const doomed = await newTask('Old landing page experiment');
const del = await api.call('delete_task', { key: key(doomed) }, { idempotencyKey: idem() });
t.ok(del.status === 202 && del.data.approval.reasons.includes('deletes the task'), 'delete_task parks for approval', JSON.stringify(del.data));
const stale = await newTask('Sunset the beta signup form');
const cancel = await api.call('update_task', { key: key(stale), status: 'canceled' }, { idempotencyKey: idem() });
t.ok(cancel.status === 202 && cancel.data.approval.reasons.includes('cancels the task'), 'cancelling parks for approval', JSON.stringify(cancel.data));
const handoff = await newTask('Review the privacy page');
const reassign = await api.call('update_task', { key: key(handoff), assignee: 'Ana Park' }, { idempotencyKey: idem() });
t.ok(reassign.status === 202 && reassign.data.approval.reasons.includes('assigns work to someone else'), 'giving work to a person parks for approval', JSON.stringify(reassign.data));
const anas = await newTask('Ana’s design review', ana, { assigneeId: state.people.ana.id });
const takeAway = await api.call('update_task', { key: key(anas), assignee: '' }, { idempotencyKey: idem() });
t.ok(takeAway.status === 202 && takeAway.data.approval.reasons.includes('takes work away from someone else'), 'taking work from a person parks for approval', JSON.stringify(takeAway.data));
const outside = await api.call('create_task', { title: 'Plan the budget offsite', project: 'Finance' }, { idempotencyKey: idem() });
t.ok(outside.status === 202 && outside.data.approval.reasons.some((r) => /outside its scope/.test(r)), 'work in another project parks for approval', JSON.stringify(outside.data));

// bulk: past the limit of distinct tasks in the window, the next change parks
const bulk = [];
for (let i = 1; i <= 7; i++) {
  const task = await newTask(`Translate page ${i}`);
  bulk.push(await api.call('add_comment', { key: key(task), text: `Queued page ${i} for translation.` }, { idempotencyKey: idem() }));
}
const firstParked = bulk.findIndex((r) => r.status === 202);
t.ok(firstParked > 0 && bulk.slice(0, firstParked).every((r) => r.status === 201), `bulk changes park once the limit is reached (after ${firstParked} changes)`, bulk.map((r) => r.status).join(','));
t.ok(/changes more than \d+ tasks within \d+ minutes/.test(bulk[firstParked]?.data?.approval?.reasons?.join(' ') ?? ''), 'the card names the bulk limit', JSON.stringify(bulk[firstParked]?.data));

// the cards, as people see them
const cards = (await owner('GET', '/api/agent-approvals')).data.approvals;
t.ok(cards.length >= 6, `the owner sees ${cards.length} pending cards`);
const anaCards = (await ana('GET', '/api/agent-approvals')).data.approvals;
t.ok(anaCards.some((c) => c.id === takeAway.data.approval.id) && !anaCards.some((c) => c.id === del.data.approval.id), 'Ana sees the card for her own task, not the others');

// approve the delete, decline the reassignment
const approved = await owner('POST', `/api/agent-approvals/${del.data.approval.id}/approve`);
t.ok(approved.status === 200 && approved.data.approval.status === 'approved', 'approving runs the request', JSON.stringify(approved.data));
t.ok(Boolean((await owner('GET', `/api/tasks/${doomed.id}/detail`)).data.task.deletedAt), 'the approved delete moved the task to the trash');
const declined = await owner('POST', `/api/agent-approvals/${reassign.data.approval.id}/decline`);
t.ok(declined.status === 200 && declined.data.approval.status === 'declined', 'declining leaves it undone', JSON.stringify(declined.data));
t.ok((await owner('GET', `/api/tasks/${handoff.id}/detail`)).data.task.assigneeId === null, 'the declined reassignment changed nothing');
t.ok((await owner('POST', `/api/agent-approvals/${reassign.data.approval.id}/approve`)).status === 409, 'a decided card can’t be decided again');
const anaDecides = await ana('POST', `/api/agent-approvals/${takeAway.data.approval.id}/decline`);
t.ok(anaDecides.status === 200, 'the person the task belongs to can decide its card');
t.ok((await ana('POST', `/api/agent-approvals/${cancel.data.approval.id}/approve`)).status === 403, 'a member can’t decide a card on someone else’s task');

// the agent can check how it went
const viaApi = await api.call('get_approval', { id: del.data.approval.id });
t.ok(viaApi.data.status === 'approved' && viaApi.data.decidedAt, 'get_approval reports the decision');
t.ok((await api.call('get_approval', { id: reassign.data.approval.id })).data.status === 'declined', 'and the declined one');

// history and audit: the change is the agent's, done for the person who approved it
const audit = (await owner('GET', `/api/agents/${scoutId}/audit`)).data.entries;
const parkedEntry = audit.find((e) => e.action === 'delete_task' && e.outcome === 'pending_approval');
const doneEntry = audit.find((e) => e.action === 'delete_task' && e.outcome === 'ok');
t.ok(parkedEntry && doneEntry, 'the audit trail has the parked request and the approved run');
t.ok(doneEntry?.actingForId === state.people.owner.id && doneEntry?.detail?.approvedBy === state.people.owner.id, 'the approved run is recorded for the approver', JSON.stringify(doneEntry));
t.ok(audit.some((e) => e.action === 'approval_declined' && e.actorId === state.people.owner.id), 'the decline is in the audit trail too');
await owner('POST', `/api/agent-approvals/${cancel.data.approval.id}/approve`);
const cancelled = (await owner('GET', `/api/tasks/${stale.id}/detail`)).data;
const change = cancelled.activity.find((a) => a.type === 'status' && a.data?.to === 'canceled');
t.ok(cancelled.task.status === 'canceled' && change?.actorId === scoutId && change?.actingForId === state.people.owner.id, 'the history shows the agent’s change “for” the approver', JSON.stringify(change));
const anasHistory = (await owner('GET', `/api/tasks/${anas.id}/detail`)).data.activity ?? [];
t.ok(!anasHistory.some((a) => a.actorId === scoutId && a.type === 'assigneeId'), 'the declined take-away left no change in the history');
t.done();
