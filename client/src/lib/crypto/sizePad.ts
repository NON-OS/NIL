// Pads bytes to a size that says little about what's inside: at least 1 KiB, the next power of
// two up to 64 KiB, then the next 32 KiB. Four bytes in front give the real length.
const FLOOR = 1024;
const STEP_FROM = 64 * 1024;
const STEP = 32 * 1024;

function bucket(n: number) {
  if (n <= FLOOR) return FLOOR;
  if (n <= STEP_FROM) return 2 ** Math.ceil(Math.log2(n));
  return Math.ceil(n / STEP) * STEP;
}

const sizePad = {
  bucket,

  pad(bytes: Uint8Array) {
    const out = new Uint8Array(bucket(bytes.length + 4));
    new DataView(out.buffer).setUint32(0, bytes.length);
    out.set(bytes, 4);
    return out;
  },

  unpad(padded: Uint8Array) {
    if (padded.length < 4) throw new Error('That padded message is too short.');
    const n = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0);
    if (n > padded.length - 4) throw new Error('That padded message says it holds more than it does.');
    return padded.slice(4, 4 + n);
  },
};

export default sizePad;
