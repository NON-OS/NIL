import HttpError from '../lib/HttpError.js';
import config from '../config.js';
import chatPeople from './chatPeople.js';

// The people a request names for a conversation, sorted and checked: each one on the team,
// nobody twice, and as many as the kind of conversation allows.
export default function memberList(value, kind, me) {
  if (!Array.isArray(value) || value.length > config.chat.maxMembers) throw HttpError.badRequest('Pick the people for this conversation.');
  const ids = [...new Set([me, ...value.map(String)])].sort();
  if (!ids.every((id) => chatPeople.includes(id))) throw HttpError.badRequest('One of those people can’t join conversations.');
  if (kind === 'dm' && ids.length !== 2) throw HttpError.badRequest('A direct message is between two people.');
  if (kind === 'group' && (ids.length < 3 || ids.length > config.chat.groupMax)) throw HttpError.badRequest(`A group message has 3 to ${config.chat.groupMax} people. Make a channel for more.`);
  return ids;
}
