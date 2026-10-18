import { poseidon1 } from 'poseidon-lite/poseidon1';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { poseidon3 } from 'poseidon-lite/poseidon3';
import type { MasterKeys } from './masterKeys';

export interface Secrets {
  nullifier: bigint;
  secret: bigint;
}

// The Privacy Pools note maths, matching the SDK and circuits: a deposit's secrets come from the
// master keys, the pool's scope and the deposit's index; the secrets of what's left after each
// withdrawal come from the deposit's label and the withdrawal's index. So every note the team
// ever made can be worked out again from the phrase and the chain.
const poolSecrets = {
  deposit: (keys: MasterKeys, scope: bigint, index: number): Secrets => ({
    nullifier: poseidon3([keys.masterNullifier, scope, BigInt(index)]),
    secret: poseidon3([keys.masterSecret, scope, BigInt(index)]),
  }),
  withdrawal: (keys: MasterKeys, label: bigint, index: number): Secrets => ({
    nullifier: poseidon3([keys.masterNullifier, label, BigInt(index)]),
    secret: poseidon3([keys.masterSecret, label, BigInt(index)]),
  }),
  precommitment: (s: Secrets) => poseidon2([s.nullifier, s.secret]),
  commitment: (value: bigint, label: bigint, s: Secrets) => poseidon3([value, label, poseidon2([s.nullifier, s.secret])]),
  nullifierHash: (s: Secrets) => poseidon1([s.nullifier]),
};

export default poolSecrets;
