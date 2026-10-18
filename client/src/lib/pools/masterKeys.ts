import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { poseidon1 } from 'poseidon-lite/poseidon1';
import poolPhrase from './poolPhrase';

export interface MasterKeys {
  masterNullifier: bigint;
  masterSecret: bigint;
}

// The two master secrets every deposit's and withdrawal's secrets come from, derived from the
// phrase exactly as the Privacy Pools SDK does (generateMasterKeys): the private keys of the
// first two Ethereum accounts of the phrase, each hashed with Poseidon.
export default function masterKeys(key: Uint8Array): MasterKeys {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(poolPhrase.fromKey(key)));
  const account = (i: number) => {
    const k = root.derive(`m/44'/60'/${i}'/0/0`).privateKey;
    if (!k) throw new Error('The pool key gave no account key.');
    return poseidon1([bytesToNumberBE(k)]);
  };
  return { masterNullifier: account(0), masterSecret: account(1) };
}
