import http from '../api/http';
import store from '../state/store';
import ethereum from '../lib/ethereum';
import shortAddress from '../lib/shortAddress';
import registerKeysCall from '../lib/stealth/registerKeysCall';
import type RegistryEntry from '../types/RegistryEntry';

// Your meta-address in the public ERC-6538 registry. This browser only talks to the Nil server,
// so reading it back goes through there; publishing is a transaction from your own wallet.
const stealthRegistry = {
  mine: () => http.get<{ registry: RegistryEntry }>('/me/stealth/registry').then((r) => r.registry),

  // registerKeys(1, meta-address), sent from the wallet bounties are paid to, which is the one
  // payers look up. The wallet shows the transaction and its fee before anything is sent.
  async publish(metaAddress: string) {
    const { me, nox, stealth } = store.get();
    if (!nox || !stealth?.registry || !me?.address) throw new Error('The stealth registry isn’t available on this server.');
    const { address } = await ethereum.account();
    if (address.toLowerCase() !== me.address.toLowerCase()) {
      throw new Error(`Switch your wallet to ${shortAddress(me.address)}, the wallet your bounties are paid to. Payers look that one up in the registry.`);
    }
    await ethereum.useChain(nox.chainId);
    return ethereum.send({ from: address, to: stealth.registry, data: registerKeysCall(metaAddress) });
  },
};

export default stealthRegistry;
