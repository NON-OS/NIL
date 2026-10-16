import ApiError from '../api/ApiError';
import store from '../state/store';
import keyring from '../state/keyring';
import ethereum from '../lib/ethereum';
import saveBlob from '../lib/saveBlob';
import VaultError from '../lib/VaultError';
import b64u from '../lib/crypto/b64u';
import identityFromSeed from '../lib/crypto/identityFromSeed';
import recoveryKit from '../lib/crypto/recoveryKit';
import keyDirectory from './keyDirectory';
import walletWraps from './walletWraps';
import publishKeys from './publishKeys';
import vault from './vault';

const otherKeys = () => new VaultError('kit-older', 'This kit holds other keys than the ones on record for you. Restoring it replaces them, and teammates will be asked to confirm the change.');

// The recovery kit: a passphrase-locked copy of your identity you keep yourself, for when no
// linked wallet can open your keys any more.
const recovery = {
  async download(passphrase: string, onProgress?: (p: number) => void) {
    const identity = keyring.identity();
    if (!identity) throw new Error('Unlock your keys first.');
    const { origin, workspaceKey, me } = store.get();
    const kit = await recoveryKit.make(identity.seed, { origin, workspaceKey, userId: me!.id, fingerprint: vault.fingerprint()! }, passphrase, onProgress);
    saveBlob(new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' }), `nil-recovery-kit-${new URL(origin).hostname}.json`);
  },

  // Restores your identity from a kit and wraps it for the wallet now in the browser. A kit
  // holding keys other than the ones on record only replaces them when `replace` is set.
  async restore(file: unknown, passphrase: string, { replace = false, onProgress }: { replace?: boolean; onProgress?: (p: number) => void } = {}) {
    const { seed, kit } = await recoveryKit.open(file, passphrase, onProgress);
    const { workspaceKey, me } = store.get();
    if (kit.workspaceKey !== workspaceKey || kit.userId !== me!.id) throw new Error('That recovery kit belongs to another account or workspace.');
    const identity = identityFromSeed(seed);
    const listed = (await keyDirectory.load({ fresh: true })).get(me!.id);
    const differs = Boolean(listed) && (listed!.publicKey !== b64u.encode(identity.publicKey) || listed!.signingKey !== b64u.encode(identity.signingKey));
    if (differs && !replace) throw otherKeys();
    const { address } = await ethereum.account();
    const wrap = await walletWraps.make(seed, address);
    try {
      if (listed && !differs) await walletWraps.save(wrap);
      else await publishKeys(identity, address, { reset: differs || replace, wrap });
    } catch (err) {
      // keys the listing hides (their signing wallet was unlinked) can still differ from the kit's
      if (err instanceof ApiError && err.status === 409 && !replace) throw otherKeys();
      throw err;
    }
    vault.lock();
    await vault.adopt(identity);
  },
};

export default recovery;
