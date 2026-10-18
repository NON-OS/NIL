import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import poolFetch from './poolFetch.js';
import relayData from './relayData.js';
import grossAmount from './grossAmount.js';

const DIGITS = /^\d{1,78}$/;
const HEX = /^0x[0-9a-fA-F]+$/;

// The relayer's price for one payout, signed by the relayer so it can't change between the
// quote and the withdrawal. Nil checks that the terms it signed pay exactly this payout's
// one-time address, within the pool's fee cap, then works out what to withdraw so the
// contributor receives the exact amount Nil asked for.
export default async function relayQuote(intent, found) {
  const amount = BigInt(intent.amount);
  const res = await poolFetch('relayer', '/relayer/quote', {
    method: 'POST',
    json: { chainId: config.pools.chainId, amount: amount.toString(), asset: found.token, recipient: intent.to_address, extraGas: config.pools.extraGas },
  });
  const q = res.data ?? {};
  const signed = q.feeCommitment ?? {};
  if (!res.ok) throw new HttpError(502, 'The relayer wouldn’t quote this payout. Try again in a minute, or check that it serves this token.');
  if (!DIGITS.test(String(q.feeBPS ?? '')) || !HEX.test(String(signed.withdrawalData ?? '')) || !HEX.test(String(signed.signedRelayerCommitment ?? '')) || !Number.isSafeInteger(signed.expiration)) {
    throw new HttpError(502, 'The relayer sent a quote Nil can’t read.');
  }
  const feeBps = BigInt(q.feeBPS);
  const terms = relayData(signed.withdrawalData);
  if (!terms || terms.recipient !== intent.to_address || terms.feeBps !== feeBps) throw new HttpError(502, 'The relayer’s signed terms don’t pay this payout’s address, so Nil won’t use them.');
  if (feeBps > found.maxRelayFeeBps) throw new HttpError(409, `The relayer asks ${Number(feeBps) / 100}% for this payout, above the pool’s cap of ${Number(found.maxRelayFeeBps) / 100}%. Try a larger payout or later.`);
  if (String(signed.asset ?? '').toLowerCase() !== found.token || String(signed.amount ?? '') !== amount.toString()) throw new HttpError(502, 'The relayer’s signed terms are for a different payout.');
  const gross = grossAmount(amount, feeBps);
  return {
    feeBps: feeBps.toString(),
    gross: gross.toString(),
    fee: (gross - amount).toString(),
    extraGas: Boolean(signed.extraGas),
    expiresAt: signed.expiration,
    entrypoint: config.pools.entrypoint,
    scope: found.scope.toString(),
    withdrawalData: signed.withdrawalData.toLowerCase(),
    feeCommitment: {
      expiration: signed.expiration,
      withdrawalData: signed.withdrawalData,
      asset: signed.asset,
      amount: amount.toString(),
      extraGas: Boolean(signed.extraGas),
      signedRelayerCommitment: signed.signedRelayerCommitment,
    },
  };
}
