import frameFooter from './frameFooter';

// Padding for sound and video sent browser to browser, so the relay can't read speech or
// movement from frame sizes (sizes as frameFooter.target picks them):
//
//   [frame][zeros][padding length: u32]['N' 'I' 'L' 'P']
//
// A sender pads only once the other browser has said it takes the padding off (peerLink), so a
// frame is only ever stripped by someone expecting it; the marker and a length that fits keep
// an unpadded frame from being mistaken for one.
const MARK = [0x4e, 0x49, 0x4c, 0x50];
const TAIL = 8;

const framePadding = {
  // `floor`: for sound, the size this stream has gone out at so far
  pad(frame: Uint8Array, audio = false, floor = 0): Uint8Array {
    const size = frameFooter.target(frame.length, audio, floor);
    const out = new Uint8Array(size + TAIL);
    out.set(frame);
    new DataView(out.buffer).setUint32(size, size - frame.length);
    out.set(MARK, size + 4);
    return out;
  },

  // the frame without its padding, or the frame as it came if it has none
  strip(data: Uint8Array): Uint8Array {
    const n = data.length;
    if (n <= TAIL || MARK.some((b, i) => data[n - 4 + i] !== b)) return data;
    const padding = new DataView(data.buffer, data.byteOffset, n).getUint32(n - TAIL);
    if (padding > n - TAIL - 1) return data;
    return data.subarray(0, n - TAIL - padding);
  },
};

export default framePadding;
