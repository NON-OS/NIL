import crypto from 'node:crypto';
import { subOrder } from '@zk-kit/baby-jubjub';
import trusteeDealing from './trusteeDealing.js';

const rand = () => BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % subOrder;

// Runs a vote's whole key setup: every trustee commits, then every trustee reveals, each signed
// with the key they published. `trustees` lists [position, client] pairs; with `check`, each one
// then reports the shares dealt to it in order, which a vote needs before it takes ballots.
// Returns each trustee's secret line by position, the way a test keeps them to decrypt later,
// and the responses so a test can assert on them.
export default async function dealVoteKey(proposalId, trustees, { check = false } = {}) {
  const lines = {};
  const dealings = {};
  const responses = [];
  for (const [position, call] of trustees) {
    lines[position] = [rand(), rand()];
    dealings[position] = trusteeDealing(proposalId, position, lines[position], call.signer);
    responses.push(await call('PUT', `/api/proposals/${proposalId}/commitment`, dealings[position].commit));
  }
  for (const [position, call] of trustees) responses.push(await call('PUT', `/api/proposals/${proposalId}/dealing`, dealings[position].reveal));
  if (check) for (const [, call] of trustees) responses.push(await call('POST', `/api/proposals/${proposalId}/shares-check`, { ok: true }));
  return { lines, responses };
}
