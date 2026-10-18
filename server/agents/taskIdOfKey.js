import sql from '../db/sql.js';

// The task a tool call names by its key ("NON-12", or just "12"), or null. The audit trail, the
// run log and stored idempotent replies keep it, so what they quote of a task can be wiped when
// the task turns private or is erased.
export default function taskIdOfKey(key) {
  const number = Number(String(key ?? '').trim().split('-').pop());
  return Number.isInteger(number) && number > 0 ? sql.get('SELECT id FROM tasks WHERE number = ?', number)?.id ?? null : null;
}
