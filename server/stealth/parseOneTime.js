import { secp256k1 } from '@noble/curves/secp256k1';
import HttpError from '../lib/HttpError.js';

const ADDRESS = /^0x[0-9a-f]{40}$/;
const POINT = /^0x0[23][0-9a-f]{64}$/;

// A private payout's one-time address as the payer's browser worked it out: the address, the
// ephemeral public key (a point on the curve) and the view tag. The ephemeral private key never
// comes here. Nothing public ties the address to the payee, so the payee's browser is what
// checks it, before the payout is moved.
export default function parseOneTime(stealth) {
  const address = String(stealth?.address ?? '').trim().toLowerCase();
  const ephemeralPublicKey = String(stealth?.ephemeralPublicKey ?? '').trim().toLowerCase();
  const viewTag = stealth?.viewTag;
  try {
    if (!ADDRESS.test(address) || !POINT.test(ephemeralPublicKey) || !Number.isInteger(viewTag) || viewTag < 0 || viewTag > 255) throw new Error('format');
    secp256k1.ProjectivePoint.fromHex(ephemeralPublicKey.slice(2));
  } catch {
    throw HttpError.badRequest('The private payout’s one-time address is malformed. Reload Nil and pay again.');
  }
  return { address, ephemeralPublicKey, viewTag };
}
