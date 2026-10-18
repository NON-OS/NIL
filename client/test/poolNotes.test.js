import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Group } from '@semaphore-protocol/group';
import poolPhrase from '../src/lib/pools/poolPhrase.ts';
import masterKeys from '../src/lib/pools/masterKeys.ts';
import poolSecrets from '../src/lib/pools/poolSecrets.ts';
import noteBook from '../src/lib/pools/noteBook.ts';
import noteSecrets from '../src/lib/pools/noteSecrets.ts';
import noteSeal from '../src/lib/pools/noteSeal.ts';
import rebuildNotes from '../src/lib/pools/rebuildNotes.ts';
import poolCalls from '../src/lib/pools/poolCalls.ts';
import treeProof from '../src/lib/pools/treeProof.ts';
import withdrawalContext from '../src/lib/pools/withdrawalContext.ts';
import grossAmount from '../src/lib/pools/grossAmount.ts';
import relayTerms from '../src/lib/pools/relayTerms.ts';

// The browser's half of pool payouts: key derivation matching the Privacy Pools SDK 1.5.0 byte
// for byte, the team's note bookkeeping, rebuilding notes from the chain, and the encrypted book.
const V = JSON.parse(fs.readFileSync(new URL('./fixtures/poolVectors.json', import.meta.url)));
const key = poolPhrase.toKey(V.mnemonic);
const keys = masterKeys(key);
const SCOPE = V.scope;
const WALLET = '0x3c1c177ff0b1c74fa28fa8704a4695e1d5ea50ec';

test('the phrase and every secret match the SDK’s generateMasterKeys and secret derivations', () => {
  assert.equal(poolPhrase.fromKey(key), V.mnemonic);
  assert.equal(poolPhrase.toKey(`  ${V.mnemonic.toUpperCase()} `).length, 16);
  assert.throws(() => poolPhrase.toKey(V.mnemonic.replace('yellow', 'wallet')), /valid recovery phrase/);
  assert.deepEqual([keys.masterNullifier.toString(), keys.masterSecret.toString()], [V.masterNullifier, V.masterSecret]);
  const d0 = poolSecrets.deposit(keys, BigInt(SCOPE), 0);
  const d1 = poolSecrets.deposit(keys, BigInt(SCOPE), 1);
  assert.deepEqual([d0.nullifier.toString(), d0.secret.toString(), d1.nullifier.toString(), d1.secret.toString()], [V.deposit0.nullifier, V.deposit0.secret, V.deposit1.nullifier, V.deposit1.secret]);
  assert.equal(poolSecrets.precommitment(d0).toString(), V.precommitment0);
  assert.equal(poolSecrets.commitment(BigInt(V.commitment.value), BigInt(V.label), d0).toString(), V.commitment.hash);
  const w0 = poolSecrets.withdrawal(keys, BigInt(V.label), 0);
  assert.deepEqual([w0.nullifier.toString(), w0.secret.toString()], [V.withdrawal0.nullifier, V.withdrawal0.secret]);
});

test('call data, context, relay terms and Merkle proofs match the SDK and viem', () => {
  assert.equal(poolCalls.deposit(V.calls.deposit.asset, BigInt(V.calls.deposit.value), BigInt(V.calls.deposit.precommitment)), V.calls.deposit.data);
  const r = V.calls.ragequit;
  // snarkjs gives the second point unswapped; the call swaps each pair for the verifier
  const proof = { pi_a: [...r.pA, '1'], pi_b: [[r.pB[0][1], r.pB[0][0]], [r.pB[1][1], r.pB[1][0]], ['1', '0']], pi_c: [...r.pC, '1'] };
  assert.equal(poolCalls.ragequit({ proof, publicSignals: r.pubSignals }), r.data);
  assert.equal(poolCalls.approve('0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB', 5n), `0x095ea7b3${'0'.repeat(24)}34a2068192b1297f2a7f85d7d8cde66f8f0921cb${'5'.padStart(64, '0')}`);
  assert.equal(`0x${withdrawalContext('0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB', V.relayData, BigInt(SCOPE)).toString(16).padStart(64, '0')}`, V.context);
  assert.equal(relayTerms(V.relayData).feeBps, 42n);
  assert.throws(() => relayTerms('0x12'), /malformed/);
  const merkle = treeProof(V.leaves, BigInt(V.commitment.hash), V.merkle.root, 'pool tree');
  assert.deepEqual([merkle.index, merkle.siblings.length, merkle.depth], [BigInt(V.merkle.index), 32, 32n]);
  assert.deepEqual(merkle.siblings.slice(0, 4).map(String), V.merkle.siblings);
  assert.throws(() => treeProof(V.leaves, BigInt(V.commitment.hash), '1', 'pool tree'), /doesn’t match the one on-chain/);
  const twoRoot = new Group(['11', '22'].map(BigInt)).root.toString();
  assert.throws(() => treeProof(['11', '22'], 99n, twoRoot, 'association set'), /isn’t approved/);
  for (const net of [1n, 250_000_048n]) assert.equal(grossAmount(net, 42n) - (grossAmount(net, 42n) * 42n) / 10000n, net);
});

test('deposit bookkeeping: reserved before sending, credited after the vetting fee, indexes never reused', () => {
  let book = noteBook.empty();
  let first;
  ({ book, note: first } = noteBook.reserve(book, { symbol: 'USDC', scope: SCOPE, depositor: WALLET.toUpperCase().replace('0X', '0x'), amount: 25_000_000n }));
  assert.deepEqual([first.index, first.state, first.depositor], [0, 'sending', WALLET]);
  book = noteBook.sent(book, first, '0xAB');
  book = noteBook.failed(book, first);
  let second;
  ({ book, note: second } = noteBook.reserve(book, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 30_000_000n }));
  // a failed deposit's index stays used: its precommitment might still land
  assert.equal(second.index, 1);
  assert.equal(noteBook.nextIndex(book, 'another scope'), 0);
  book = noteBook.mined(book, second, { label: V.label, value: '29850000' });
  const open = book.notes.find((n) => n.index === 1);
  assert.deepEqual([open.state, open.value, open.deposited], ['open', '29850000', '29850000']);
  assert.throws(() => noteBook.mined(book, { scope: 'x', index: 9 }, { label: '1', value: '1' }), /isn’t in the team’s pool notes/);

  const approved = () => true;
  assert.deepEqual(noteBook.balances(book, approved).get('USDC'), { total: 29_850_000n, usable: 29_850_000n });
  assert.deepEqual(noteBook.balances(book, () => false).get('USDC'), { total: 29_850_000n, usable: 0n });
  assert.equal(noteBook.pick(book, 'USDC', 29_850_001n, approved), null);
  const picked = noteBook.pick(book, 'USDC', 10_000_000n, approved);
  assert.equal(picked.index, 1);
  // the first spend uses the deposit's secrets, the next what the withdrawal left
  assert.equal(noteSecrets(keys, picked).nullifier, poolSecrets.deposit(keys, BigInt(SCOPE), 1).nullifier);
  book = noteBook.withdrew(book, picked, { gross: 10_000_000n, intentId: 'i1', txHash: '0x01' });
  const after = book.notes.find((n) => n.index === 1);
  assert.deepEqual([after.value, after.spends, after.state, after.payouts.length], ['19850000', 1, 'open', 1]);
  assert.equal(noteSecrets(keys, after).nullifier, poolSecrets.withdrawal(keys, BigInt(V.label), 0).nullifier);
  assert.throws(() => noteBook.withdrew(book, after, { gross: 20_000_000n, intentId: 'i2', txHash: null }), /enough/);
  book = noteBook.withdrew(book, after, { gross: 19_850_000n, intentId: 'i2', txHash: null });
  assert.equal(book.notes.find((n) => n.index === 1).state, 'spent');
  assert.equal(noteBook.balances(book, approved).get('USDC'), undefined);
});

test('a pending relay holds its note back, and a ragequit empties it', () => {
  let book = noteBook.empty();
  let note;
  ({ book, note } = noteBook.reserve(book, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 1n }));
  book = noteBook.mined(book, note, { label: V.label, value: '50' });
  book = noteBook.pending(book, note, 'i9', 20n);
  assert.equal(noteBook.pick(book, 'USDC', 1n, () => true), null);
  assert.equal(noteBook.balances(book, () => true).get('USDC').usable, 0n);
  book = noteBook.exited(book, note);
  assert.deepEqual([book.notes[0].state, book.notes[0].value, book.notes[0].pending], ['exited', '0', null]);
});

test('two admins’ books merge without losing a deposit or moving a spend backwards', () => {
  let base = noteBook.empty();
  let n0;
  ({ book: base, note: n0 } = noteBook.reserve(base, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 1n }));
  base = noteBook.mined(base, n0, { label: V.label, value: '100' });
  const ada = noteBook.withdrew(base, n0, { gross: 40n, intentId: 'a', txHash: null });
  const erik = noteBook.reserve(base, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 5n }).book;
  const merged = noteBook.merge(erik, ada);
  assert.equal(merged.notes.length, 2);
  assert.deepEqual([merged.notes[0].spends, merged.notes[0].value], [1, '60']);
  assert.deepEqual(noteBook.merge(ada, erik).notes.map((n) => n.spends), [1, 0]);
});

// Public events as a pool would emit them for this team's deposits and withdrawals, among
// someone else's.
function chainEvents() {
  const d0 = poolSecrets.deposit(keys, BigInt(SCOPE), 0);
  const d2 = poolSecrets.deposit(keys, BigInt(SCOPE), 2);
  const w0 = poolSecrets.withdrawal(keys, 77n, 0);
  return [
    { type: 'deposit', depositor: WALLET, label: '77', value: '1000', precommitment: poolSecrets.precommitment(d0).toString(), blockNumber: 10, txHash: '0xd0' },
    { type: 'deposit', depositor: '0xother', label: '78', value: '5', precommitment: '12345', blockNumber: 11, txHash: '0xd1' },
    { type: 'deposit', depositor: WALLET, label: '79', value: '300', precommitment: poolSecrets.precommitment(d2).toString(), blockNumber: 12, txHash: '0xd2' },
    { type: 'withdrawal', value: '400', nullifierHash: poolSecrets.nullifierHash(d0).toString(), blockNumber: 13, txHash: '0xw0' },
    { type: 'withdrawal', value: '100', nullifierHash: poolSecrets.nullifierHash(w0).toString(), blockNumber: 14, txHash: '0xw1' },
    { type: 'ragequit', label: '79', value: '300', blockNumber: 15, txHash: '0xr0' },
  ];
}

test('notes are rebuilt from the pool key and public events alone', () => {
  const notes = rebuildNotes(keys, { symbol: 'USDC', scope: SCOPE }, chainEvents());
  assert.deepEqual(notes.map((n) => [n.index, n.label, n.value, n.spends, n.state]), [[0, '77', '500', 2, 'open'], [2, '79', '0', 0, 'exited']]);
  assert.deepEqual(notes[0].payouts.map((p) => p.txHash), ['0xw0', '0xw1']);
  // another phrase finds nothing
  const strangers = masterKeys(poolPhrase.toKey('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
  assert.deepEqual(rebuildNotes(strangers, { symbol: 'USDC', scope: SCOPE }, chainEvents()), []);

  // adopting the rebuild: the chain's numbers win, the book keeps which payout was which, and a
  // deposit still marked as sending that never landed is marked failed
  let book = noteBook.empty();
  let n0;
  ({ book, note: n0 } = noteBook.reserve(book, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 1000n }));
  book = noteBook.mined(book, n0, { label: '77', value: '1000' });
  book = noteBook.withdrew(book, n0, { gross: 400n, intentId: 'first', txHash: '0xw0' });
  book = noteBook.pending(book, book.notes[0], 'second', 100n);
  book = noteBook.reserve(book, { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 9n }).book;
  const adopted = noteBook.adopt(book, SCOPE, notes);
  assert.deepEqual(adopted.notes.map((n) => [n.index, n.state, n.value, n.pending]), [[0, 'open', '500', null], [1, 'failed', '0', null], [2, 'exited', '0', null]]);
  assert.equal(adopted.notes[0].payouts[0].txHash, '0xw0');
});

test('the book is sealed under the pool key, bound to its tag, and opens with nothing else', async () => {
  const book = noteBook.reserve(noteBook.empty(), { symbol: 'USDC', scope: SCOPE, depositor: WALLET, amount: 7n }).book;
  const sealed = await noteSeal.seal(key, book);
  assert.ok(!sealed.includes('USDC'));
  assert.deepEqual(await noteSeal.open(key, sealed), book);
  assert.match(noteSeal.tag(key), /^[0-9a-f]{32}$/);
  const other = crypto.getRandomValues(new Uint8Array(16));
  assert.notEqual(noteSeal.tag(other), noteSeal.tag(key));
  await assert.rejects(noteSeal.open(other, sealed), /don’t open with this pool key/);
});
