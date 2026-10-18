import http from '../api/http';
import store from '../state/store';
import signing from '../state/signing';
import ethereum from '../lib/ethereum';
import VaultError from '../lib/VaultError';
import unlockMessage from '../lib/crypto/unlockMessage';
import signatureSecret from '../lib/crypto/signatureSecret';
import wrapIdentity from '../lib/crypto/wrapIdentity';

export interface Wrap {
  address: string;
  nonce: string;
  issuedAt: string;
  wrapped: string;
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const context = (address: string) => {
  const s = store.get();
  return { origin: s.origin, workspaceKey: s.workspaceKey, userId: s.me!.id, address };
};

// This wallet's signature of its unlock message. A new wrap signs twice: a wallet that signs the
// same message differently each time could never open its wrap again.
async function sign(address: string, nonce: string, issuedAt: string, { twice = false } = {}) {
  const message = unlockMessage({ ...context(address), nonce, issuedAt });
  signing.next();
  const signature = await ethereum.sign(message, address);
  if (!twice) return signature;
  signing.next();
  if (hex(signatureSecret(await ethereum.sign(message, address), 'check')) !== hex(signatureSecret(signature, 'check'))) {
    throw new Error('Your wallet signs the same message differently each time, so it can’t hold your keys. Wallets like MetaMask, Rabby, Ledger and Trezor work.');
  }
  return signature;
}

// Your identity, wrapped once per linked wallet. The server keeps the wraps; only a signature
// from the matching wallet, made in this browser, opens one.
const walletWraps = {
  list: () => http.get<{ wraps: Wrap[] }>('/me/identity-wraps').then((r) => r.wraps),

  // The seed wrapped for one wallet, checked to open again before it's sent anywhere.
  async make(seed: Uint8Array, address: string): Promise<Wrap> {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(8)));
    const issuedAt = new Date().toISOString();
    const signature = await sign(address, nonce, issuedAt, { twice: true });
    const wrapped = await wrapIdentity.seal(seed, signature, context(address));
    await wrapIdentity.open(wrapped, signature, context(address));
    return { address: address.toLowerCase(), nonce, issuedAt, wrapped };
  },

  // Asks the wallet to sign this wrap's unlock message and opens the wrap with it.
  async open(wrap: Wrap, address: string) {
    const signature = await sign(address, wrap.nonce, wrap.issuedAt);
    try {
      return await wrapIdentity.open(wrap.wrapped, signature, context(address));
    } catch {
      throw new VaultError('no-wrap', 'Your wallet’s signature doesn’t open your keys here. If this site moved to a new address, restore from your recovery kit.');
    }
  },

  save: (wrap: Wrap) => http.put('/me/identity-wraps', wrap),
};

export default walletWraps;
