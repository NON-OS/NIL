import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// A sender's signed word for which frames it sent: the first 8 bytes of SHA-256 over each
// encrypted frame, a counter that only goes up, and an Ed25519 signature under a key the sender
// made for this call and announced in its signed frame keys (callMediaKey). Everyone in a call
// holds everyone's frame keys, so a key alone can't say who made a frame; this does. A frame
// nobody's list names was made by someone else, and a list from before is refused by its counter.
//
//   [version: 1][counter: u32][count: u8][count × 8 bytes][signature: 64]
const VERSION = 1;
const HASH = 8;
const SIG = 64;
const MAX = 255;

const signed = (identity: string, body: Uint8Array) => concatBytes(utf8ToBytes(`nil/call-frames/v1\n${identity}\n`), body);

const frameManifest = {
  // a frame's name in a list
  hash: (frame: Uint8Array) => bytesToHex(sha256(frame).subarray(0, HASH)),

  max: MAX,

  sign(hashes: string[], counter: number, identity: string, secret: Uint8Array): Uint8Array {
    const list = hashes.slice(-MAX);
    const body = new Uint8Array(6 + list.length * HASH);
    const view = new DataView(body.buffer);
    body[0] = VERSION;
    view.setUint32(1, counter);
    body[5] = list.length;
    list.forEach((h, i) => body.set(hexToBytes(h), 6 + i * HASH));
    return concatBytes(body, ed25519.sign(signed(identity, body), secret));
  },

  // the counter and the frames a list names, if its sender signed it
  open(bytes: Uint8Array, identity: string, publicKey: Uint8Array): { counter: number; hashes: string[] } | null {
    if (bytes.length < 6 + SIG || bytes[0] !== VERSION) return null;
    const count = bytes[5];
    if (bytes.length !== 6 + count * HASH + SIG) return null;
    const body = bytes.subarray(0, 6 + count * HASH);
    try {
      if (!ed25519.verify(bytes.subarray(body.length), signed(identity, body), publicKey)) return null;
    } catch {
      return null;
    }
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) hashes.push(bytesToHex(body.subarray(6 + i * HASH, 6 + (i + 1) * HASH)));
    return { counter: new DataView(body.buffer, body.byteOffset).getUint32(1), hashes };
  },
};

export default frameManifest;
