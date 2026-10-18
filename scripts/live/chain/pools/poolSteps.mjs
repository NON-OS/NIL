import path from 'node:path';
import { fileURLToPath } from 'node:url';
import poolKit from '../../../../client/src/lib/pools/poolKit.ts';
import noteBook from '../../../../client/src/lib/pools/noteBook.ts';
import identityFromSeed from '../../../../client/src/lib/crypto/identityFromSeed.ts';
import calls from '../calls.mjs';

const ZK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../client/public/zk/privacy-pools');
const files = (name) => ({ wasm: path.join(ZK, `${name}.wasm`), zkey: path.join(ZK, `${name}.zkey`) });

// What an admin's browser does for the team pool, step by step with the app's own modules and
// the app's own API routes. Only the wallet differs: a test key signs and sends raw
// transactions where the app would ask the browser wallet.
export default function poolSteps({ api, chain, wallet, info, key = crypto.getRandomValues(new Uint8Array(16)), seed = crypto.getRandomValues(new Uint8Array(32)) }) {
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
      await mined(await wallet.send({ to: usdc.token, data: calls.approve(info.entrypoint, amount), gas: 120_000n }));
      const hash = await wallet.send({ to: info.entrypoint, data: poolKit.poolCalls.deposit(usdc.token, amount, precommitment), gas: 1_200_000n });
      await save(noteBook.sent(book, out.note, hash));
      const receipt = await mined(hash);
      const seen = await api.get(`/pools/receipts/${hash}`);
      const ours = seen.events.find((e) => e.type === 'deposit' && e.precommitment === precommitment.toString());
      if (!ours) throw new Error('Nil found no deposit with our precommitment in the receipt');
      await save(noteBook.mined(book, out.note, { label: ours.label, value: ours.value }));
      return { hash, block: Number(BigInt(receipt.blockNumber)), label: ours.label, value: BigInt(ours.value) };
    },

    // Prepare and send, as the From pool button does: intent, quote, the browser's own checks,
    // the trees rebuilt and matched to the chain's roots, the proof, then the relay.
    async pay(task, ephemeralKey) {
      const { intent } = await api.post(`/tasks/${task.id}/payments/intent`, { stealth: { ephemeralKey }, via: 'pool' });
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
      const { payment } = await api.post(`/pool-payouts/${intent.id}/relay`, body);
      await save(noteBook.withdrew(book, note, { gross: BigInt(quote.gross), intentId: intent.id, txHash: payment.txHash }));
      return { intent, quote, payment, provingMs, body };
    },

    async ragequit(note) {
      const proof = await poolKit.proveCommitment({ value: BigInt(note.value), label: BigInt(note.label), secrets: poolKit.noteSecrets(keys, note) }, files('commitment'));
      const hash = await wallet.send({ to: usdc.pool, data: poolKit.poolCalls.ragequit(proof), gas: 1_000_000n });
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
