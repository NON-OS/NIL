import store from '../state/store';
import poolKey from '../state/poolKey';
import ethereum from '../lib/ethereum';
import noteBook from '../lib/pools/noteBook';
import poolAccount from './poolAccount';
import poolReceipt from './poolReceipt';
import type PoolNote from '../types/PoolNote';
import type { PoolAsset } from '../types/PoolInfo';

const kit = async () => (await import('../lib/pools/poolKit')).default;

// Takes what's left of a deposit back to the wallet that made it, in public: the way out for a
// deposit the association set declined, or any time the team would rather have it back. It
// links nothing new (that wallet made the deposit for all to see) and needs no relayer, but no
// bounty can be paid privately from it afterwards. Only the depositing wallet can send it.
export default async function poolRagequit(asset: PoolAsset, note: PoolNote, onStep: (step: string) => void = () => {}) {
  const { nox } = store.get();
  const key = poolKey.get();
  if (!nox || !key || !asset.pool || !note.label) throw new Error('Open the team’s pool first.');
  const { address } = await ethereum.account();
  if (address.toLowerCase() !== note.depositor) throw new Error(`Only the wallet that made this deposit can take it back. Switch your wallet to ${note.depositor}.`);
  await ethereum.useChain(nox.chainId);
  const { masterKeys, noteSecrets, proveCommitment, poolCalls } = await kit();
  onStep('Proving the deposit is the team’s');
  const proof = await proveCommitment({ value: BigInt(note.value), label: BigInt(note.label), secrets: noteSecrets(masterKeys(key), note) });
  onStep('Confirm in your wallet');
  const hash = await ethereum.send({ from: address, to: asset.pool, data: poolCalls.ragequit(proof) });
  onStep('Waiting for it to be mined');
  const receipt = await poolReceipt(hash);
  if (receipt?.state === 'failed') throw new Error('The ragequit failed on-chain, so nothing moved.');
  if (receipt?.state === 'mined' && receipt.events.some((e) => e.type === 'ragequit' && e.label === note.label)) await poolAccount.update((book) => noteBook.exited(book, note));
  return hash;
}
