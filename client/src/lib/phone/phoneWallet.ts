import makePhoneWallet from './makePhoneWallet';
import phoneConfig from './phoneConfig';
import phonePending from './phonePending';
import phoneProtocol from './phoneProtocol';
import phoneStorage from './phoneStorage';
import wallets from '../wallets';
import isHandset from '../isHandset';

const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);

// The phone wallet of this tab. On a phone it's never offered: there the wallet app is on the
// same device, and opening Nil inside it stays the way in. A tablet gets it like a computer does. WalletConnect's client itself loads
// only when someone connects a phone, or a reload finds one connected.
const phoneWallet = makePhoneWallet({
  config: () => (isHandset() ? null : phoneConfig.get()),
  async load(config, id) {
    const [client, provider] = await Promise.all([import('./createSignClient'), import('./createPhoneProvider')]);
    return { ...(await client.default(config, id)), createProvider: provider.default };
  },
  saved: phoneStorage,
  publish(wallet) {
    wallets.setPhone(wallet ? { id: phoneProtocol.walletId, name: `${wallet.name} (phone)`, icon: null, provider: wallet.provider } : null);
    if (wallet) wallets.choose(phoneProtocol.walletId);
  },
  watch: phonePending.add,
  newId,
});

export default phoneWallet;
