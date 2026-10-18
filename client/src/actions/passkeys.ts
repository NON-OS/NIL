import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import VaultError from '../lib/VaultError';
import passkeyPrf from '../lib/passkeyPrf';
import b64u from '../lib/crypto/b64u';
import passkeyWrap from '../lib/crypto/passkeyWrap';
import walletWraps from './walletWraps';
import type Passkey from '../types/Passkey';

const UNSUPPORTED = 'Your passkey manager doesn’t support unlocking encryption keys, so nothing was saved. You can delete the passkey it just made.';

const context = (credentialId: string) => {
  const s = store.get();
  return { userId: s.me!.id, workspaceKey: s.workspaceKey, credentialId };
};
type Listing = { passkeys: Passkey[] };
const keep = ({ passkeys }: Listing) => store.set({ passkeys });
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

// Your identity, wrapped for passkeys next to your wallets. A passkey's PRF output opens its wrap;
// that output and your seed never leave this browser.
const passkeys = {
  // A passkey is never your only way back to your keys: a wallet holds them, or you saved a kit.
  canAdd: async () => Boolean(store.get().recoveryKitAt) || (await walletWraps.list()).length > 0,

  // Makes a passkey, wraps your seed with its PRF output, and saves the wrap only once a second
  // ask has given an output that opens it again.
  async add(label: string) {
    const identity = keyring.identity();
    if (!identity) throw new Error('Unlock your keys first.');
    if (!(await passkeys.canAdd())) throw new Error('Add a wallet to your keys or download a recovery kit first, so a passkey is never your only way back.');
    const me = store.get().me!;
    const seed = Uint8Array.from(identity.seed);
    try {
      const credentialId = await passkeyPrf.create({ name: `${me.name} (encryption keys)`, displayName: me.name });
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const first = await passkeyPrf.evaluate(credentialId, salt);
      if (!first) throw new Error(UNSUPPORTED);
      const wrapped = await passkeyWrap.seal(seed, first, context(credentialId)).finally(() => first.fill(0));
      const second = await passkeyPrf.evaluate(credentialId, salt);
      if (!second) throw new Error(UNSUPPORTED);
      const opened = await passkeyWrap.open(wrapped, second, context(credentialId)).catch(() => null).finally(() => second.fill(0));
      const opens = opened !== null && same(opened, seed);
      opened?.fill(0);
      if (!opens) throw new Error('This passkey gave a different answer the second time, so it can’t hold your keys. Nothing was saved.');
      if (keyring.identity() !== identity) throw new Error('Your keys were locked while the passkey was being added. Nothing was saved.');
      keep(await http.post<Listing>('/me/passkeys', { credentialId, salt: b64u.encode(salt), wrapped, label }));
    } finally {
      seed.fill(0);
    }
  },

  // Asks whichever of your passkeys you use to open its wrap. The caller checks the seed against
  // your published keys, exactly as after a wallet opens its wrap.
  async open() {
    const list = store.get().passkeys;
    if (!list.length) throw new Error('No passkey unlocks your keys yet. Add one in Settings, under Sign-in & security.');
    const answer = await passkeyPrf.evaluateAny(list.map((p) => ({ credentialId: p.credentialId, salt: b64u.decode(p.salt) })));
    const passkey = list.find((p) => p.credentialId === answer.credentialId);
    const output = answer.output;
    if (!passkey || !output) {
      output?.fill(0);
      throw new Error('That passkey didn’t give Nil what it needs to unlock your keys. Unlock with your wallet instead.');
    }
    try {
      return { seed: await passkeyWrap.open(passkey.wrapped, output, context(passkey.credentialId)), id: passkey.id };
    } catch {
      throw new VaultError('no-wrap', 'That passkey doesn’t open your keys here. Unlock with your wallet, or restore from your recovery kit.');
    } finally {
      output.fill(0);
    }
  },

  used: (id: string) => http.post<Listing>(`/me/passkeys/${encodeURIComponent(id)}/used`).then(keep).catch(() => {}),
  rename: async (id: string, label: string) => keep(await http.patch<Listing>(`/me/passkeys/${encodeURIComponent(id)}`, { label })),
  remove: async (id: string) => keep(await http.del<Listing>(`/me/passkeys/${encodeURIComponent(id)}`)),
};

export default passkeys;
