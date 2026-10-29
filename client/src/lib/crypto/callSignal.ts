import { utf8ToBytes } from '@noble/hashes/utils';
import sealedBox from './sealedBox';

// Every message one browser in a call sends another through Nil's server, sealed to the
// recipient's X25519 key: session descriptions with their network addresses and certificate
// fingerprints, frame keys, and the small "try again" and "refused" notes. The server passes a
// blob it can't open, all of a few sizes, so it can't even tell which kind of message it is.
// What's inside is checked as before: descriptions and frame keys carry their sender's
// signature (callLink, callMediaKey).
//
//   sealed: [length: u32][JSON, deflated][zeros up to a multiple of 512 bytes]
const box = sealedBox('nil/call-signal/v1');
const STEP = 512;
const MAX = 64_000;

// deflated or inflated, stopping at MAX bytes so a small blob can't unpack into a huge one
async function squeeze(bytes: Uint8Array, format: 'compress' | 'decompress') {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(format === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    total += r.value.length;
    if (total > MAX) {
      await reader.cancel();
      throw new Error('too big');
    }
    parts.push(r.value);
  }
  const out = new Uint8Array(total);
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
}

export interface SealedSignal {
  type: 'sealed';
  box: string;
}

const callSignal = {
  async seal(message: unknown, recipientPublic: Uint8Array): Promise<SealedSignal> {
    const packed = await squeeze(utf8ToBytes(JSON.stringify(message)), 'compress');
    const padded = new Uint8Array(Math.ceil((packed.length + 4) / STEP) * STEP);
    new DataView(padded.buffer).setUint32(0, packed.length);
    padded.set(packed, 4);
    return { type: 'sealed', box: await box.seal(padded, recipientPublic) };
  },

  // what a sealed message says, or null for anything that isn't one sealed to this person
  async open(message: unknown, mine: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<unknown> {
    const m = message as Partial<SealedSignal> | null;
    if (!m || m.type !== 'sealed' || typeof m.box !== 'string' || m.box.length > MAX) return null;
    try {
      const padded = await box.open(m.box, mine.privateKey, mine.publicKey);
      const length = new DataView(padded.buffer, padded.byteOffset).getUint32(0);
      if (length + 4 > padded.length) return null;
      const json = new TextDecoder().decode(await squeeze(padded.subarray(4, 4 + length), 'decompress'));
      return json.length > MAX ? null : JSON.parse(json);
    } catch {
      return null;
    }
  },
};

export default callSignal;
