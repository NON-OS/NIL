const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflatedSize(data: Uint8Array, room: number) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return size;
    size += value.length;
    if (size > room) {
      await reader.cancel();
      return Infinity;
    }
  }
}

// Unpacks a zip (a Word file is one) just far enough to count what it really holds, before
// anything else opens it: at most `maxEntries` files and `maxBytes` once inflated, measured by
// inflating each one, not by what the file claims. A zip bomb is refused instead of filling the
// tab's memory. Throws `message` when it doesn't fit.
export default async function zipCheck(bytes: Uint8Array, { maxEntries, maxBytes, message }: { maxEntries: number; maxBytes: number; message: string }) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(message);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count > maxEntries || count === 0xffff || at === 0xffffffff) throw new Error(message);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw new Error(message);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const local = view.getUint32(at + 42, true);
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) throw new Error(message);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + packed > bytes.length) throw new Error(message);
    const data = bytes.subarray(start, start + packed);
    if (method === 0) total += packed;
    else if (method === 8) total += await inflatedSize(data, maxBytes - total);
    else throw new Error(message);
    if (total > maxBytes) throw new Error(message);
  }
}
