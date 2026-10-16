import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import unlockPrivateKeys from './unlockPrivateKeys';
import metaAddress from '../lib/stealth/metaAddress';
import stealthKey from '../lib/stealth/stealthKey';
import signTransaction from '../lib/signTransaction';
import encodeTransfer from '../lib/encodeTransfer';
import type User from '../types/User';
import type StealthPayout from '../types/StealthPayout';

interface Prepared {
  chainId: number;
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  balance: string;
}

function saveMe(user: User) {
  const s = store.get();
  store.set({ me: { ...s.me!, ...user }, users: records.put(s.users, user) });
}

// The key for one payout, checked against the address it was paid to before it's used.
async function keyFor(payout: StealthPayout) {
  const keys = await unlockPrivateKeys();
  const derived = stealthKey(keys.spendingKey, keys.viewingKey, payout.ephemeralPublicKey);
  if (derived.address !== payout.address) throw new Error('These keys don’t open this payout: it was paid to keys you no longer hold. If yours were reset and you kept a recovery kit from before, restore it to move the payout.');
  return derived;
}

const stealth = {
  async enable() {
    const keys = await unlockPrivateKeys();
    saveMe((await http.put<{ user: User }>('/me/stealth', { metaAddress: metaAddress(keys.spendingKey, keys.viewingKey) })).user);
  },

  async disable() {
    saveMe((await http.del<{ user: User }>('/me/stealth')).user);
  },

  payouts: () => http.get<{ payouts: StealthPayout[] }>('/stealth/payouts').then((r) => r.payouts),

  // One payout's balance read now. Only for the payout you're about to move: the move names
  // the address to the node anyway, and checking one at a time never groups your addresses.
  balance: (payout: StealthPayout) => http.get<{ balance: { eth: string; token: string } }>(`/stealth/payouts/${payout.id}/balance`).then((r) => r.balance),

  // Moves everything a one-time address holds to wherever you choose: first the tokens, then
  // whatever ETH is left after gas. Signed here; the server only relays the signed bytes.
  async move(payout: StealthPayout, to: string, tokenAddress: string) {
    const { privateKey, address } = await keyFor(payout);
    const hashes: string[] = [];
    try {
      const sign = (p: Prepared, nonce: number, tx: { to: string; data: string; value: bigint }) =>
        signTransaction(privateKey, { chainId: p.chainId, nonce, gas: BigInt(p.gas), maxFeePerGas: BigInt(p.maxFeePerGas), maxPriorityFeePerGas: BigInt(p.maxPriorityFeePerGas), ...tx });
      const send = async (raw: string) => hashes.push((await http.post<{ txHash: string }>('/stealth/broadcast', { raw })).txHash);

      let spent = 0n;
      let nextNonce: number | null = null;
      const tokens = BigInt(payout.balance?.token ?? '0');
      if (tokens > 0n) {
        const data = encodeTransfer(to, tokens);
        const p = await http.post<Prepared>('/stealth/prepare', { from: address, to: tokenAddress, data, value: '0' });
        spent = BigInt(p.gas) * BigInt(p.maxFeePerGas);
        if (BigInt(p.balance) < spent) throw new Error('This address has no ETH to pay gas for the move. Ask the payer for a small top-up, or export its key into a wallet.');
        await send(sign(p, p.nonce, { to: tokenAddress, data, value: 0n }));
        nextNonce = p.nonce + 1;
      }
      const p = await http.post<Prepared>('/stealth/prepare', { from: address, to, data: '0x', value: '0' });
      const rest = BigInt(p.balance) - spent - BigInt(p.gas) * BigInt(p.maxFeePerGas);
      if (rest > 0n) await send(sign(p, nextNonce ?? p.nonce, { to, data: '0x', value: rest }));
      return hashes;
    } finally {
      privateKey.fill(0);
    }
  },

  // The one-time address's private key, for importing into any wallet. Shown once, never stored.
  async exportKey(payout: StealthPayout) {
    const { privateKey } = await keyFor(payout);
    const hex = `0x${[...privateKey].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    privateKey.fill(0);
    return hex;
  },
};

export default stealth;
