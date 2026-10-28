import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sealBlockers from '../src/lib/sealBlockers.ts';

// Differential tests for formal/Nil/ChatSeal.lean: the rule sealGate applies before a browser
// seals anything in a conversation must stop it exactly where the model does, for the same reason.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/chat-seal.json', import.meta.url)));
const ids = (l) => l.map((n) => `u${n}`);

test('the browser refuses to seal exactly where the model does', () => {
  for (const c of vectors.cases) {
    const got = sealBlockers({ me: `u${c.me}`, holders: ids(c.holders), confirmed: ids(c.confirmed), members: ids(c.members), epoch: Number(c.epoch), seen: Number(c.seen), forked: c.forked, settingsOk: c.settingsOk });
    assert.equal(got, c.blocker, c.name);
  }
});

test('the vectors reach every reason, and sealing', () => {
  const reasons = new Set(vectors.cases.map((c) => c.blocker));
  for (const r of [null, 'history', 'settings', 'unconfirmed', 'holdsOut']) assert.ok(reasons.has(r), String(r));
});
