import crypto from 'node:crypto';
import { subOrder } from '@zk-kit/baby-jubjub';
import trusteeDealing from './trusteeDealing.js';

const rand = () => BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % subOrder;

// Runs a vote's whole key setup: every trustee commits, then every trustee reveals. `trustees`
// lists [position, client] pairs. Returns each trustee's secret line by position, the way a test
// keeps them to decrypt later, and the responses so a test can assert on them.
export default async function dealVoteKey(proposalId, trustees) {
  const lines = {};
  const dealings = {};
  const responses = [];
  for (const [position, call] of trustees) {
    lines[position] = [rand(), rand()];
    dealings[position] = trusteeDealing(proposalId, position, lines[position]);
    responses.push(await call('PUT', `/api/proposals/${proposalId}/commitment`, { commitment: dealings[position].commitment }));
  }
  for (const [position, call] of trustees) responses.push(await call('PUT', `/api/proposals/${proposalId}/dealing`, dealings[position].reveal));
  return { lines, responses };
}
