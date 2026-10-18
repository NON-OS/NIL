import path from 'node:path';
import { fileURLToPath } from 'node:url';
import poolKit from '../../../../client/src/lib/pools/poolKit.ts';
import noteBook from '../../../../client/src/lib/pools/noteBook.ts';
import identityFromSeed from '../../../../client/src/lib/crypto/identityFromSeed.ts';
import newStealthPayment from '../../../../client/src/lib/stealth/newStealthPayment.ts';
import calls from '../calls.mjs';

const ZK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../client/public/zk/privacy-pools');
const files = (name) => ({ wasm: path.join(ZK, `${name}.wasm`), zkey: path.join(ZK, `${name}.zkey`) });
// Gas limits for the test wallet's transactions, set rather than estimated. Circle's test USDC
// on Sepolia used 118,526 gas for approve, more than the 120,000 these steps first allowed, so
// approve has 300,000. A deposit inserts into the pool's tree, and a ragequit checks a proof.
const GAS = Object.freeze({ approve: 300_000n, deposit: 1_200_000n, ragequit: 1_000_000n });
// how often Check for the payout is asked again while a payout the relayer didn't confirm isn't mined
const FIND_EVERY_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What an admin's browser does for the team pool, step by step with the app's own modules and
// the app's own API routes. Only the wallet differs: a test key signs and sends raw
// transactions where the app would ask the browser wallet. A relay the relayer didn't confirm is
// looked for with Check for the payout for up to `findForMs`.
export default function poolSteps({ api, chain, wallet, info, findForMs = 0, key = crypto.getRandomValues(new Uint8Array(16)), seed = crypto.getRandomValues(new Uint8Array(32)) }) {
  const identity = identityFromSeed(seed);
  const keys = poolKit.masterKeys(key);
  const usdc = info.assets.find((a) => a.symbol === 'USDC');
  let book = noteBook.empty();
  let rev = 0;

  const save = async (next) => {
    const { account } = await api.put('/pool-account/notes', { notes: await poolKit.noteSeal.seal(key, next), rev });
    book = next;
    rev = account.notesRev;
  };
  const mined = async (hash) => {
    const receipt = await chain.receipt(hash);
    if (receipt.status !== '0x1') throw new Error(`${hash} failed on-chain`);
    return receipt;
  };
  // A relayer can send the withdrawal and still report a failure: 0xbow's does when its
  // extra-gas swap fails after the withdrawal is out. Nil looks on-chain for it then, and says
  // so with `recovered`. If it wasn't mined yet, the admin's way on is Check for the payout.
  const relay = async (intent, body) => {
    try {
      const out = await api.post(`/pool-payouts/${intent.id}/relay`, body);
      return { payment: out.payment, recovered: out.recovered ? 'Nil found it on-chain when the relay came back' : null };
    } catch (err) {
      const until = Date.now() + findForMs;
      for (;;) {
        // a node that can't answer right now is another try, not the reason the relay failed
        const { payment } = await api.post(`/pool-payouts/${intent.id}/find`).catch(() => ({ payment: null }));
        if (payment) return { payment, recovered: `Check for the payout found it after ${String(err.message).slice(0, 200)}` };
        if (Date.now() >= until) throw err;
        await sleep(FIND_EVERY_MS);
      }
    }
  };

  return {
    keys,
    usdc,
    book: () => book,

    // the team's account as an earlier run left it, or a new one
    async open() {
      const { account } = await api.get('/pool-account');
      if (!account.exists) return this.create();
      book = await poolKit.noteSeal.open(key, account.notes);
      rev = account.notesRev;
      return account;
    },

    async create() {
      const body = { keyTag: poolKit.noteSeal.tag(key), wrapped: await poolKit.poolKeySeal.seal(key, identity.publicKey), notes: await poolKit.noteSeal.seal(key, book) };
      const { account } = await api.post('/pool-account', body);
      rev = account.notesRev;
      // what another browser of this admin does: open the sealed key and the notes again
      const opened = await poolKit.poolKeySeal.open(account.wrapped, identity.privateKey, identity.publicKey);
      if (Buffer.from(opened).toString('hex') !== Buffer.from(key).toString('hex')) throw new Error('the sealed pool key did not open to the same key');
      return account;
    },

    async deposit(amount) {
      const out = noteBook.reserve(book, { symbol: 'USDC', scope: usdc.scope, depositor: wallet.address, amount });
      await save(out.book);
      const precommitment = poolKit.poolSecrets.precommitment(poolKit.poolSecrets.deposit(keys, BigInt(usdc.scope), out.note.index));
      await mined(await wallet.send({ to: usdc.token, data: calls.approve(info.entrypoint, amount), gas: GAS.approve }));
      const hash = await wallet.send({ to: info.entrypoint, data: poolKit.poolCalls.deposit(usdc.token, amount, precommitment), gas: GAS.deposit });
      await save(noteBook.sent(book, out.note, hash));
      const receipt = await mined(hash);
      const seen = await api.get(`/pools/receipts/${hash}`);
      const ours = seen.events.find((e) => e.type === 'deposit' && e.precommitment === precommitment.toString());
      if (!ours) throw new Error('Nil found no deposit with our precommitment in the receipt');
      await save(noteBook.mined(book, out.note, { label: ours.label, value: ours.value }));
      return { hash, block: Number(BigInt(receipt.blockNumber)), label: ours.label, value: BigInt(ours.value) };
    },

    // Prepare and send, as the From pool button does: the one-time address worked out here from
    // the contributor's meta-address, intent, quote, the browser's own checks, the trees rebuilt
    // and matched to the chain's roots, the proof, then the relay.
    async pay(task, meta) {
      const one = newStealthPayment(meta);
      const { intent } = await api.post(`/tasks/${task.id}/payments/intent`, { stealth: one, via: 'pool' });
      if (intent.to !== one.address) throw new Error('Nil named a different address than the one worked out here');
      const { quote } = await api.post(`/pool-payouts/${intent.id}/quote`);
      const terms = poolKit.relayTerms(quote.withdrawalData);
      if (terms.recipient !== intent.to || poolKit.grossAmount(BigInt(intent.amount), terms.feeBps) !== BigInt(quote.gross)) throw new Error('quote does not pay the one-time address exactly');
      const sets = await api.get('/pools/USDC/sets');
      const approved = new Set(sets.aspLeaves);
      const note = noteBook.pick(book, 'USDC', BigInt(quote.gross), (n) => approved.has(n.label));
      if (!note) throw new Error('no approved note covers the payout');
      const label = BigInt(note.label);
      const existing = poolKit.noteSecrets(keys, note);
      const state = poolKit.treeProof(sets.stateLeaves, poolKit.poolSecrets.commitment(BigInt(note.value), label, existing), sets.stateRoot, 'pool tree');
      const asp = poolKit.treeProof(sets.aspLeaves, label, sets.aspRoot, 'association set');
      const context = poolKit.withdrawalContext(quote.entrypoint, quote.withdrawalData, BigInt(quote.scope));
      const started = Date.now();
      const proof = await poolKit.proveWithdrawal({ value: BigInt(note.value), label, existing, next: poolKit.poolSecrets.withdrawal(keys, label, note.spends), withdrawn: BigInt(quote.gross), context, state, asp }, files('withdraw'));
      const provingMs = Date.now() - started;
      await save(noteBook.pending(book, note, intent.id, BigInt(quote.gross)));
      const body = { withdrawal: { processooor: quote.entrypoint, data: quote.withdrawalData }, proof: proof.proof, publicSignals: proof.publicSignals, feeCommitment: quote.feeCommitment };
      const { payment, recovered } = await relay(intent, body);
      await save(noteBook.withdrew(book, note, { gross: BigInt(quote.gross), intentId: intent.id, txHash: payment.txHash }));
      return { intent, quote, payment, recovered, provingMs, body };
    },

    async ragequit(note) {
      const proof = await poolKit.proveCommitment({ value: BigInt(note.value), label: BigInt(note.label), secrets: poolKit.noteSecrets(keys, note) }, files('commitment'));
      const hash = await wallet.send({ to: usdc.pool, data: poolKit.poolCalls.ragequit(proof), gas: GAS.ragequit });
      await mined(hash);
      const seen = await api.get(`/pools/receipts/${hash}`);
      if (!seen.events.some((e) => e.type === 'ragequit' && e.label === note.label)) throw new Error('Nil saw no ragequit for our label');
      await save(noteBook.exited(book, note));
      return hash;
    },

    // The notes again from nothing but the key and the pool's public events.
    async rebuild(fromBlock, toBlock) {
      const { events } = await api.post('/pools/USDC/events', { fromBlock, toBlock });
      return poolKit.rebuildNotes(keys, { symbol: 'USDC', scope: usdc.scope }, events);
    },
  };
}
