import crc32 from './docConvert/crc32';

type Write = (bytes: Uint8Array) => void | Promise<void>;
type Field = [number, 2 | 4 | 8];

const UTF8 = 0x0800;
// the CRC and sizes follow the entry's bytes, so an entry can be written before they're known
const LATER = 0x0008;
// the MS-DOS attribute for a folder
const FOLDER = 0x10;

function fields(list: Field[]) {
  const bytes = new Uint8Array(list.reduce((n, [, width]) => n + width, 0));
  const view = new DataView(bytes.buffer);
  let at = 0;
  for (const [value, width] of list) {
    if (width === 2) view.setUint16(at, value, true);
    else if (width === 4) view.setUint32(at, value, true);
    else view.setBigUint64(at, BigInt(value), true);
    at += width;
  }
  return bytes;
}

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};

// A zip archive written as it goes, so files of any size pass through without the whole archive
// in memory. Each entry is stored as it is, since most files people keep are compressed already;
// its CRC-32 and size follow its bytes. An entry or an archive past 4 GB gets the zip64 fields.
// Names are UTF-8. `zip64At` is where zip64 starts, lowered only to test it.
export default function zipWriter(write: Write, { when = new Date(), zip64At = 0xffffffff } = {}) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = (Math.max(0, when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const central: Uint8Array[] = [];
  let offset = 0;
  let wide = false;
  const out = async (bytes: Uint8Array) => {
    await write(bytes);
    offset += bytes.length;
  };

  // An entry's line in the central directory, with the zip64 fields its size or place needs.
  function listed(name: Uint8Array, crc: number, size: number, start: number, folder: boolean) {
    const big = [size >= zip64At, size >= zip64At, start >= zip64At];
    const extra = big.some(Boolean) ? fields([[0x0001, 2], [big.filter(Boolean).length * 8, 2], ...([[size, 8], [size, 8], [start, 8]] as Field[]).filter((_, i) => big[i])]) : new Uint8Array();
    const version = extra.length ? 45 : 20;
    wide ||= extra.length > 0;
    const head = fields([
      [0x02014b50, 4], [version, 2], [version, 2], [UTF8 | (folder ? 0 : LATER), 2], [0, 2], [time, 2], [date, 2], [crc, 4],
      [big[1] ? 0xffffffff : size, 4], [big[0] ? 0xffffffff : size, 4], [name.length, 2], [extra.length, 2], [0, 2], [0, 2], [0, 2],
      [folder ? FOLDER : 0, 4], [big[2] ? 0xffffffff : start, 4],
    ]);
    central.push(join(head, name, extra));
  }

  return {
    // A file of `size` bytes, which `fill` hands over a piece at a time through `put`.
    async file(name: string, size: number, fill: (put: (bytes: Uint8Array) => Promise<void>) => Promise<void>) {
      const encoded = new TextEncoder().encode(name);
      const start = offset;
      const big = size >= zip64At;
      const extra = big ? fields([[0x0001, 2], [16, 2], [0, 8], [0, 8]]) : new Uint8Array();
      await out(join(fields([[0x04034b50, 4], [big ? 45 : 20, 2], [UTF8 | LATER, 2], [0, 2], [time, 2], [date, 2], [0, 4], [0, 4], [0, 4], [encoded.length, 2], [extra.length, 2]]), encoded, extra));
      let crc = 0;
      let written = 0;
      await fill(async (bytes) => {
        crc = crc32(bytes, crc);
        written += bytes.length;
        await out(bytes);
      });
      if (written !== size) throw new Error(`${name} came to a different size than it should.`);
      await out(fields(big ? [[0x08074b50, 4], [crc, 4], [size, 8], [size, 8]] : [[0x08074b50, 4], [crc, 4], [size, 4], [size, 4]]));
      listed(encoded, crc, size, start, false);
    },

    // An empty folder, so it's there when the archive is unpacked. `name` ends in a slash.
    async folder(name: string) {
      const encoded = new TextEncoder().encode(name);
      const start = offset;
      await out(join(fields([[0x04034b50, 4], [20, 2], [UTF8, 2], [0, 2], [time, 2], [date, 2], [0, 4], [0, 4], [0, 4], [encoded.length, 2], [0, 2]]), encoded));
      listed(encoded, 0, 0, start, true);
    },

    // The central directory and the end records, after the last entry.
    async end() {
      const start = offset;
      for (const line of central) await out(line);
      const size = offset - start;
      const count = central.length;
      if (wide || count >= 0xffff || start >= zip64At || size >= zip64At) {
        const record = offset;
        await out(fields([[0x06064b50, 4], [44, 8], [45, 2], [45, 2], [0, 4], [0, 4], [count, 8], [count, 8], [size, 8], [start, 8]]));
        await out(fields([[0x07064b50, 4], [0, 4], [record, 8], [1, 4]]));
        await out(fields([[0x06054b50, 4], [0, 2], [0, 2], [Math.min(count, 0xffff), 2], [Math.min(count, 0xffff), 2], [Math.min(size, 0xffffffff), 4], [0xffffffff, 4], [0, 2]]));
      } else {
        await out(fields([[0x06054b50, 4], [0, 2], [0, 2], [count, 2], [count, 2], [size, 4], [start, 4], [0, 2]]));
      }
    },
  };
}
