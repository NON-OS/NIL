import crc32 from './docConvert/crc32';

const OFFICE = /\.(docx|docm|dotx|xlsx|xlsm|xltx|pptx|pptm|potx)$/i;
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
// The parts that say who wrote a file, who saved it last, when, on which company's template, and
// whatever custom fields were added, replaced by empty ones of the same kind.
const EMPTY: Record<string, string> = {
  'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"/>',
  'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>',
  'docProps/custom.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>',
};

interface Entry {
  name: Uint8Array;
  method: number;
  crc: number;
  packed: number;
  size: number;
  data: Uint8Array;
}

// A local header (offset null) or a central directory entry for `e`. Times, flags and attributes
// are left at zero, which also drops when each part was last saved.
function header(e: Entry, offset: number | null) {
  const central = offset !== null;
  // a central entry carries the version that made it in front of the shared fields
  const shift = central ? 2 : 0;
  const out = new Uint8Array((central ? 46 : 30) + e.name.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, central ? CENTRAL : LOCAL, true);
  if (central) v.setUint16(4, 20, true);
  v.setUint16(4 + shift, 20, true);
  v.setUint16(8 + shift, e.method, true);
  v.setUint32(14 + shift, e.crc, true);
  v.setUint32(18 + shift, e.packed, true);
  v.setUint32(22 + shift, e.size, true);
  v.setUint16(26 + shift, e.name.length, true);
  if (central) v.setUint32(42, offset, true);
  out.set(e.name, central ? 46 : 30);
  return out;
}

// A Word, Excel or PowerPoint file without who wrote it, who last saved it, when, and the
// company, template and custom fields it carries. Everything else is copied as it is, so the
// document opens exactly as before. Anything that isn't one, or doesn't read as a zip, comes back
// unchanged.
export default async function officeClean(file: Blob, name: string): Promise<Blob> {
  if (!OFFICE.test(name)) return file;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 22 - 0xffff) && view.getUint32(end, true) !== EOCD) end--;
  if (end < Math.max(0, bytes.length - 22 - 0xffff)) return file;
  const count = view.getUint16(end + 10, true);
  const entries: Entry[] = [];
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL) return file;
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const entryName = bytes.slice(at + 46, at + 46 + nameLength);
    const packed = view.getUint32(at + 20, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const replace = EMPTY[new TextDecoder().decode(entryName)];
    if (replace) {
      const data = new TextEncoder().encode(replace);
      entries.push({ name: entryName, method: 0, crc: crc32(data), packed: data.length, size: data.length, data });
    } else entries.push({ name: entryName, method: view.getUint16(at + 10, true), crc: view.getUint32(at + 16, true), packed, size: view.getUint32(at + 24, true), data: bytes.subarray(start, start + packed) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const local = header(e, null);
    centrals.push(header(e, offset));
    parts.push(local, e.data);
    offset += local.length + e.data.length;
  }
  const directory = centrals.reduce((n, c) => n + c.length, 0);
  const tail = new Uint8Array(22);
  const t = new DataView(tail.buffer);
  t.setUint32(0, EOCD, true);
  t.setUint16(8, entries.length, true);
  t.setUint16(10, entries.length, true);
  t.setUint32(12, directory, true);
  t.setUint32(16, offset, true);
  return new Blob([...parts, ...centrals, tail], { type: file.type });
}
