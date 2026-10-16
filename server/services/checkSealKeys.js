import HttpError from '../lib/HttpError.js';

// A private task's key may only be sealed for the people who can see the task, and at least
// one of them, or nobody could ever open it again.
export default function checkSealKeys(sealed, { creatorId, assigneeId }) {
  const allowed = new Set([creatorId, assigneeId].filter(Boolean));
  const holders = Object.keys(sealed.keys);
  if (holders.some((id) => !allowed.has(id))) throw HttpError.badRequest('A private task’s key can only go to its creator and its assignee.');
  if (!holders.length) throw HttpError.badRequest('Keep a key for at least one person who can see the task.');
}
