import crypto from 'node:crypto';
import config from '../config.js';
import verifierTag from './verifierTag.js';

const VERDICT = /^(proven|absent|relayed|unverified) ([0-9a-f]{64})$/;

// The verdict in a Nil-Verification header, when the seal next to it matches this exact request
// and reply under NOX_VERIFIER_KEY. Null for no header, a malformed one or a seal that doesn't fit.
export default function readSeal(header, request, text) {
  const match = VERDICT.exec(String(header ?? '').trim());
  if (!match || !config.verification.key) return null;
  const expected = Buffer.from(verifierTag(config.verification.key, match[1], request, text), 'hex');
  return crypto.timingSafeEqual(expected, Buffer.from(match[2], 'hex')) ? match[1] : null;
}
