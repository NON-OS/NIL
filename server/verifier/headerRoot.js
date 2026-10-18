import crypto from 'node:crypto';

const ROOT = /^0x[0-9a-f]{64}$/i;
const ZERO = Buffer.alloc(32);
const pair = (a, b) => crypto.createHash('sha256').update(a).update(b).digest();

function uint64(value) {
  const out = Buffer.alloc(32);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function root(hex) {
  if (typeof hex !== 'string' || !ROOT.test(hex)) throw new Error('A beacon block header field isn’t a 32-byte root.');
  return Buffer.from(hex.slice(2), 'hex');
}

// The SSZ hash tree root of a beacon block header: its five fields as 32-byte leaves, padded to
// eight, hashed pairwise with SHA-256. A checkpoint is exactly this root, so a header that hashes
// to it is the checkpoint's own header, whoever sent it.
export default function headerRoot(header) {
  let layer = [uint64(header.slot), uint64(header.proposer_index), root(header.parent_root), root(header.state_root), root(header.body_root), ZERO, ZERO, ZERO];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) next.push(pair(layer[i], layer[i + 1]));
    layer = next;
  }
  return `0x${layer[0].toString('hex')}`;
}
