import settingsStore from './settingsStore.js';
import siwe from '../auth/siwe.js';
import HttpError from '../lib/HttpError.js';

// Extra addresses that may pay bounties besides each admin's own wallets, for teams that pay
// from a multisig like Safe. Stored lowercased.
const treasury = {
  get: () => settingsStore.get('treasury', []),

  set(addresses) {
    if (!Array.isArray(addresses) || addresses.length > 10) throw HttpError.badRequest('Add up to 10 treasury addresses.');
    const clean = [...new Set(addresses.map((a) => String(a).trim().toLowerCase()))];
    if (clean.some((a) => !siwe.isAddress(a))) throw HttpError.badRequest('One of those isn’t an Ethereum address.');
    settingsStore.set('treasury', clean);
    return clean;
  },
};

export default treasury;
