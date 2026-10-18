import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const tidy = (phrase: string) => phrase.trim().toLowerCase().split(/\s+/).join(' ');

// The team's pool key as twelve BIP-39 words. It's the same phrase the Privacy Pools app and
// SDK take, so a team can reach its pool without Nil by typing it there.
const poolPhrase = {
  fromKey: (key: Uint8Array) => entropyToMnemonic(key, wordlist),
  toKey(phrase: string) {
    if (!validateMnemonic(tidy(phrase), wordlist)) throw new Error('Those words aren’t a valid recovery phrase. Check each word and their order.');
    return mnemonicToEntropy(tidy(phrase), wordlist);
  },
};

export default poolPhrase;
