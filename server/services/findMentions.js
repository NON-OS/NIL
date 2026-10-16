import sql from '../db/sql.js';

// "@JaneDoe" matches Jane Doe; "@jane" works too as long as only one Jane is active.
export default function findMentions(text) {
  const tokens = [...String(text).matchAll(/(^|[^\w])@([A-Za-z0-9][\w.-]*)/g)].map((m) => m[2].toLowerCase().replace(/[.-]+$/, ''));
  if (!tokens.length) return [];

  const users = sql.all('SELECT id, name FROM users WHERE deactivated = 0');
  const byFullName = new Map(users.map((u) => [u.name.replace(/\s+/g, '').toLowerCase(), u.id]));
  const byFirstName = new Map();
  for (const u of users) {
    const first = u.name.split(/\s+/)[0].toLowerCase();
    byFirstName.set(first, [...(byFirstName.get(first) ?? []), u.id]);
  }

  const found = new Set();
  for (const token of tokens) {
    if (byFullName.has(token)) found.add(byFullName.get(token));
    else if (byFirstName.get(token)?.length === 1) found.add(byFirstName.get(token)[0]);
  }
  return [...found];
}
