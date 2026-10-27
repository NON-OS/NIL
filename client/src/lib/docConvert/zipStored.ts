import crc32 from './crc32';

// The fields of a zip header, little-endian, as [value, width in bytes].
function header(fields: [number, 2 | 4][], name?: Uint8Array) {
  const bytes = new Uint8Array(fields.reduce((n, [, width]) => n + width, 0) + (name?.length ?? 0));
  const view = new DataView(bytes.buffer);
  let at = 0;
  for (const [value, width] of fields) {
    if (width === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += width;
  }
  if (name) bytes.set(name, at);
  return bytes;
}

// A zip archive with each file stored as it is, which is all a Markdown export needs: its images
// are compressed already. Names are UTF-8. Without zip64 it holds up to 4 GB, far past any doc.
export default function zipStored(files: { name: string; bytes: Uint8Array }[], when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = (Math.max(0, when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const UTF8 = 0x0800;
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.bytes);
    const size = file.bytes.length;
    const entry: [number, 2 | 4][] = [[20, 2], [UTF8, 2], [0, 2], [time, 2], [date, 2], [crc, 4], [size, 4], [size, 4], [name.length, 2], [0, 2]];
    local.push(header([[0x04034b50, 4], ...entry], name), file.bytes);
    central.push(header([[0x02014b50, 4], [20, 2], ...entry, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]], name));
    offset += 30 + name.length + size;
  }
  if (offset > 0xffffffff || files.length > 0xffff) throw new Error('Too much to fit in one zip file.');
  const directory = central.reduce((n, c) => n + c.length, 0);
  const end = header([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [directory, 4], [offset, 4], [0, 2]]);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
