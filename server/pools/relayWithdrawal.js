import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import log from '../lib/log.js';
import poolFetch from './poolFetch.js';
import relayData from './relayData.js';
import fieldList from './fieldList.js';
import grossAmount from './grossAmount.js';
import withdrawalContext from './withdrawalContext.js';

const TX = /^0x[0-9a-f]{64}$/;
const HEX = /^0x[0-9a-f]+$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const pair = (v) => fieldList(v, 2)?.length === 2;
const point = (v) => Array.isArray(v) && v.length === 3 && fieldList(v, 3) !== null;

function proofShape(proof) {
  const b = proof?.pi_b;
  if (!point(proof?.pi_a) || !point(proof?.pi_c) || !Array.isArray(b) || b.length !== 3 || !b.every(pair)) throw HttpError.badRequest('That proof is malformed.');
  return { pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c };
}

// Hands one withdrawal proof to the relayer, after checking it pays exactly what this payout
// asked for: the entry contract as processooor, the relayer's signed terms naming this payout's
// one-time address, a withdrawn amount that leaves the contributor exactly the asked amount
// after the fee, and a context bound to those terms and this pool. The proof itself is checked
// by the relayer and again by the pool; a bad one costs nothing but a refusal.
//
// A withdrawal that fails these checks throws before the relayer sees it. After that, this
// returns what the relayer said: the hash of the transaction it confirmed sending, or, when it
// answered with an error, with success: false or not at all, the words for the admin. The
// withdrawal may have gone out even then.
export default async function relayWithdrawal(intent, found, body) {
  const processooor = String(body?.withdrawal?.processooor ?? '').toLowerCase();
  const data = String(body?.withdrawal?.data ?? '').toLowerCase();
  const signed = body?.feeCommitment ?? {};
  const signals = fieldList(body?.publicSignals, 8);
  if (!ADDRESS.test(processooor) || !HEX.test(data) || !signals || signals.length !== 8) throw HttpError.badRequest('That withdrawal is malformed.');
  const proof = proofShape(body?.proof);
  const terms = relayData(data);

  if (processooor !== config.pools.entrypoint) throw HttpError.badRequest('A pool payout has to go through the entry contract.');
  if (!terms || terms.recipient !== intent.to_address) throw HttpError.badRequest('That withdrawal doesn’t pay this payout’s one-time address.');
  if (terms.feeBps > found.maxRelayFeeBps) throw HttpError.badRequest('That withdrawal pays the relayer more than the pool allows.');
  if (String(signed.withdrawalData ?? '').toLowerCase() !== data || String(signed.amount ?? '') !== intent.amount) throw HttpError.badRequest('That withdrawal doesn’t match the relayer’s signed quote.');
  if (BigInt(signals[2]) !== grossAmount(BigInt(intent.amount), terms.feeBps)) throw HttpError.badRequest('That withdrawal wouldn’t leave the contributor exactly the amount Nil asked for.');
  if (BigInt(signals[7]) !== withdrawalContext(processooor, data, found.scope)) throw HttpError.badRequest('That proof was made for other terms.');

  const res = await poolFetch('relayer', '/relayer/request', {
    method: 'POST',
    timeoutMs: config.pools.relayTimeoutMs,
    json: { withdrawal: { processooor, data }, publicSignals: signals, proof, scope: found.scope.toString(), chainId: config.pools.chainId, feeCommitment: signed },
  }).catch(() => null);
  const hash = String(res?.data?.txHash ?? '').toLowerCase();
  if (res?.ok && res.data?.success && TX.test(hash)) return { txHash: hash };
  // the relayer's words help the admin; they carry no payout data worth hiding, but keep them short
  const said = typeof res?.data?.error === 'string' ? res.data.error.replace(/[^\x20-\x7e]/g, '').slice(0, 200) : '';
  log.warn('pools', res ? `The relayer didn’t confirm a withdrawal (HTTP ${res.status}).` : 'The relayer didn’t answer a withdrawal.');
  return { txHash: null, problem: `The relayer didn’t confirm sending the withdrawal${said ? `: ${said}` : '.'} If it went out after all, Check for the payout on the deposit under Team pool records it.` };
}
