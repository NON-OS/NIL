// What Nil adds after LiveKit has encrypted a frame on the SFU: the signed list of frames this
// sender just sent, now and then (frameManifest), and padding, so the SFU can't read speech or
// movement from the size of each frame. The receiver strips it before LiveKit decrypts.
//
//   [encrypted frame][list][padding][list length: u16][padding length: u16]['N']
const MAGIC = 0x4e;
const TAIL = 5;
const MAX = 0xffff;

// Sound goes out at one size per track, the largest it has needed so far in steps of 32 bytes,
// so quiet and speech look alike. Video rounds up to a step an eighth of the power of two below
// its size, which costs at most an eighth more and blurs how much is moving.
function target(length: number, audio: boolean, floor: number) {
  if (audio) return Math.max(floor, Math.ceil(length / 32) * 32);
  const step = Math.max(64, 2 ** Math.floor(Math.log2(Math.max(length, 1))) / 8);
  return Math.ceil(length / step) * step;
}

const frameFooter = {
  target,

  // the frame as it goes out; `size` is what it should come to before the footer, if it can
  wrap(frame: Uint8Array, list: Uint8Array | null, size: number): Uint8Array {
    const listLength = list?.length ?? 0;
    const padding = Math.min(MAX, Math.max(0, size - frame.length - listLength));
    const out = new Uint8Array(frame.length + listLength + padding + TAIL);
    out.set(frame, 0);
    if (list) out.set(list, frame.length);
    const view = new DataView(out.buffer);
    view.setUint16(out.length - TAIL, listLength);
    view.setUint16(out.length - TAIL + 2, padding);
    out[out.length - 1] = MAGIC;
    return out;
  },

  // the encrypted frame and the list it carried, or null for anything not wrapped this way
  unwrap(data: Uint8Array): { frame: Uint8Array; list: Uint8Array | null } | null {
    if (data.length < TAIL + 1 || data[data.length - 1] !== MAGIC) return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const listLength = view.getUint16(data.length - TAIL);
    const padding = view.getUint16(data.length - TAIL + 2);
    const end = data.length - TAIL - padding - listLength;
    if (end < 1) return null;
    return { frame: data.subarray(0, end), list: listLength ? data.subarray(end, end + listLength) : null };
  },
};

export default frameFooter;
