import store from '../state/store';
import poolKey from '../state/poolKey';
import ethereum from '../lib/ethereum';
import payerWallet from '../lib/payerWallet';
import noteBook from '../lib/pools/noteBook';
import poolAccount from './poolAccount';
import poolReceipt from './poolReceipt';
import type { PoolAsset } from '../types/PoolInfo';

const kit = async () => (await import('../lib/pools/poolKit')).default;

// Deposits from this admin's wallet into the token's pool: the entry contract takes the token,
// keeps its vetting fee, and the pool notes a commitment only the team's key can spend. The
// deposit is public, like any deposit: the chain shows this wallet put this much in. The note
// is written down before the wallet is asked, so a closed tab can't lose it, and its index is
// never used again even if the deposit fails.
export default async function poolDeposit(asset: PoolAsset, entrypoint: string, amount: bigint, onStep: (step: string) => void = () => {}) {
  const { nox } = store.get();
  const key = poolKey.get();
  if (!nox || !key || !asset.pool || !asset.scope) throw new Error('Open the team’s pool first.');
  if (asset.minimumDeposit && amount < BigInt(asset.minimumDeposit)) throw new Error('That’s below the pool’s smallest deposit.');
  const from = await payerWallet(nox.chainId);
  const { masterKeys, poolSecrets, poolCalls } = await kit();

  let reserved = null as ReturnType<typeof noteBook.reserve>['note'] | null;
  await poolAccount.update((book) => {
    const out = noteBook.reserve(book, { symbol: asset.symbol, scope: asset.scope!, depositor: from, amount });
    reserved = out.note;
    return out.book;
  });
  const note = reserved!;
  const precommitment = poolSecrets.precommitment(poolSecrets.deposit(masterKeys(key), BigInt(asset.scope), note.index));
  const approve = { to: asset.token, data: poolCalls.approve(entrypoint, amount) };
  const deposit = { to: entrypoint, data: poolCalls.deposit(asset.token, amount, precommitment) };

  onStep('Confirm in your wallet');
  let hash = await ethereum.batch(from, nox.chainId, [approve, deposit]).catch(async (err) => {
    await poolAccount.update((book) => noteBook.failed(book, note));
    throw err;
  });
  if (!hash) {
    // one at a time: the deposit only goes once the approval is mined, or the wallet can't price it
    const approved = await ethereum.send({ from, ...approve });
    onStep('Waiting for the approval');
    if ((await poolReceipt(approved))?.state !== 'mined') {
      await poolAccount.update((book) => noteBook.failed(book, note));
      throw new Error('The approval didn’t go through, so nothing was deposited.');
    }
    onStep('Confirm the deposit in your wallet');
    hash = await ethereum.send({ from, ...deposit }).catch(async (err) => {
      await poolAccount.update((book) => noteBook.failed(book, note));
      throw err;
    });
  }
  await poolAccount.update((book) => noteBook.sent(book, note, hash!));

  onStep('Waiting for the deposit to be mined');
  const receipt = await poolReceipt(hash);
  if (!receipt) return 'sent';
  if (receipt.state !== 'mined') {
    await poolAccount.update((book) => noteBook.failed(book, note));
    throw new Error('The deposit failed on-chain, so nothing moved.');
  }
  const ours = receipt.events.find((e) => e.type === 'deposit' && e.precommitment === precommitment.toString());
  if (!ours?.label) throw new Error('The deposit was mined, but Nil couldn’t find it in the pool. Rebuild the pool notes to pick it up.');
  await poolAccount.update((book) => noteBook.mined(book, note, { label: ours.label!, value: ours.value }));
  return 'mined';
}
