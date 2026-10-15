import sql from '../db/sql.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import rewardToken from '../lib/rewardToken.js';

function checklist(value) {
  if (!Array.isArray(value)) throw HttpError.badRequest('Checklist must be a list.');
  if (value.length > 200) throw HttpError.badRequest('A checklist can hold at most 200 items.');
  return value.map((item) => ({
    id: typeof item?.id === 'string' && /^[\w-]{1,24}$/.test(item.id) ? item.id : newId(),
    text: check.text(item?.text, 'Checklist item', { max: 500 }),
    done: Boolean(item?.done),
  }));
}

function labels(value) {
  if (!Array.isArray(value)) throw HttpError.badRequest('Labels must be a list.');
  const ids = [...new Set(value.filter((x) => typeof x === 'string'))].slice(0, 20);
  for (const id of ids) {
    if (!sql.get('SELECT 1 FROM labels WHERE id = ?', id)) throw HttpError.badRequest('One of those labels was deleted. Pick again.');
  }
  return ids;
}

function assignee(value) {
  const id = check.ref('users', value, 'Assignee');
  if (id && sql.get('SELECT deactivated FROM users WHERE id = ?', id).deactivated) {
    throw HttpError.badRequest('That person has been removed from the workspace.');
  }
  return id;
}

// Only fields present in the body come back, so callers can tell "clear it" from "leave it".
export default function parseTaskPatch(body) {
  const out = {};
  const has = (key) => Object.hasOwn(body, key);

  if (has('title')) out.title = check.text(body.title, 'Title', { min: 1, max: 300 });
  if (has('description')) out.description = check.text(body.description, 'Description', { max: 50_000 });
  if (has('status')) out.status = check.oneOf(body.status, domain.statuses, 'Status');
  if (has('priority')) out.priority = check.oneOf(Number(body.priority), [0, 1, 2, 3, 4], 'Priority');
  if (has('projectId')) out.projectId = check.ref('projects', body.projectId, 'Project');
  if (has('goalId')) out.goalId = check.ref('goals', body.goalId, 'Goal');
  if (has('assigneeId')) out.assigneeId = assignee(body.assigneeId);
  if (has('dueDate')) out.dueDate = check.date(body.dueDate, 'Due date');
  if (has('startDate')) out.startDate = check.date(body.startDate, 'Start date');
  if (has('estimate')) out.estimate = check.number(body.estimate, 'Estimate', { min: 0, max: 1000, integer: true });
  if (has('labels')) out.labels = labels(body.labels);
  if (has('checklist')) out.checklist = checklist(body.checklist);
  if (has('recurrence')) out.recurrence = body.recurrence ? check.oneOf(body.recurrence, domain.recurrences, 'Repeat') : null;
  if (has('private')) out.private = Boolean(body.private);
  if (has('listed')) out.listedAt = body.listed ? Date.now() : null;
  if (has('bounty')) out.bounty = check.amount(body.bounty, 'Bounty');
  if (has('bountyToken')) out.bountyToken = rewardToken(body.bountyToken).symbol;
  if (has('position')) out.position = check.number(body.position, 'Position') ?? 0;
  return out;
}
