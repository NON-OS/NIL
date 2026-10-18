import headerRoot from './headerRoot.js';

// The slot of a checkpoint, read from the consensus node's light-client bootstrap for it (the
// same answer Helios starts from) and only believed once the header hashes to the checkpoint
// itself. A consensus node can refuse to answer, but it can't make an old checkpoint look new.
export default async function checkpointSlot(consensusRpc, checkpoint, { timeoutMs }) {
  const url = new URL(`eth/v1/beacon/light_client/bootstrap/${checkpoint}`, consensusRpc.endsWith('/') ? consensusRpc : `${consensusRpc}/`);
  const res = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the consensus node answered HTTP ${res.status} for the checkpoint`);
  const header = (await res.json())?.data?.header?.beacon;
  if (!header || headerRoot(header) !== checkpoint.toLowerCase()) throw new Error('the consensus node sent a header that isn’t the checkpoint’s');
  return Number(header.slot);
}
