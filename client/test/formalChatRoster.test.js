import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Differential tests for formal/Nil/ChatRoster.lean. Each case is a member list following
// another; the rule every browser checks and the one the server applies before it takes a list
// must both give the model's answer, so neither can allow what the proofs say is refused.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/chat-roster.json', import.meta.url)));
const { default: chatRosterRule } = await import('../src/lib/chatRosterRule.ts');
const { default: rosterRule } = await import('../../server/chat/rosterRule.js');

const id = (n) => `u${n}`;
const list = (l) => l && { kind: l.kind, audience: l.audience, members: l.members.map(id), managers: l.managers.map(id), at: Number(l.time) };

test('the browser and the server allow exactly what the model allows', () => {
  for (const c of vectors.cases) {
    const next = { ...list(c.next), by: id(c.signer) };
    const args = [next, list(c.prev), c.linked, c.proven.map(id)];
    assert.equal(chatRosterRule(...args), c.allowed, `browser: ${c.name}`);
    assert.equal(rosterRule(...args), c.allowed, `server: ${c.name}`);
  }
});

test('the vectors reach every refusal the proofs are about', () => {
  const byName = Object.fromEntries(vectors.cases.map((c) => [c.name, c.allowed]));
  assert.equal(byName['a member leaves someone out without proof'], false);
  assert.equal(byName['a member leaves someone out, citing their leaving'], true);
  assert.equal(byName['a member makes themselves a manager'], false);
  assert.equal(byName['a member brings someone into a private channel'], false);
  assert.equal(byName['someone outside signs the next list'], false);
  assert.equal(byName['a list dated no later than the one before'], false);
  assert.equal(byName['a direct message with someone else in it'], false);
  const allowed = vectors.cases.filter((c) => c.allowed).length;
  assert.ok(allowed > 30 && vectors.cases.length - allowed > 30, 'both answers well represented');
});
