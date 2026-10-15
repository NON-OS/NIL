import { secp256k1 } from '@noble/curves/secp256k1';
import HttpError from '../lib/HttpError.js';

const META = /^st:eth:0x((?:02|03)[0-9a-f]{64})((?:02|03)[0-9a-f]{64})$/;

// "st:eth:0x<spending key><viewing key>", both compressed secp256k1 points (ERC-5564 scheme 1).
// Decoding the points also proves they lie on the curve, so a bad key is refused here, not at payout.
export default function parseMeta(meta) {
  const match = META.exec(String(meta ?? '').trim().toLowerCase());
  try {
    if (!match) throw new Error('format');
    return { spend: secp256k1.ProjectivePoint.fromHex(match[1]), view: secp256k1.ProjectivePoint.fromHex(match[2]) };
  } catch {
    throw HttpError.badRequest('That isn’t a valid stealth meta-address.');
  }
}
