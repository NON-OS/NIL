import ethereum from './ethereum';
import identity from '../actions/identity';
import http from '../api/http';
import type BountyOverview from '../types/BountyOverview';

// The connected wallet, but only if the server will accept money from it: one linked to your
// account or one of the team's treasury addresses. Checked before the wallet pops up, so
// nobody signs a transfer that Nil would then refuse to count.
export default async function payerWallet(chainId: number): Promise<string> {
  const [{ address }, mine, overview] = await Promise.all([ethereum.account(), identity.overview(), http.get<BountyOverview>('/bounties')]);
  const allowed = new Set([...mine.credentials.map((c) => c.address.toLowerCase()), ...overview.treasury]);
  if (!allowed.has(address.toLowerCase())) {
    throw new Error('Your wallet is on an account that isn’t linked to Nil. Switch accounts, or link this wallet under Settings → Security first.');
  }
  await ethereum.useChain(chainId);
  return address;
}
