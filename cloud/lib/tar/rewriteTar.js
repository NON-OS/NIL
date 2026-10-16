import { Transform } from 'node:stream';
import parseTarHeader from './parseTarHeader.js';
import paxRecords from './paxRecords.js';
import tarBlocks from './tarBlocks.js';

// PAX and GNU long-name headers are small; anything bigger is a malformed or hostile archive.
const META_LIMIT = 1024 * 1024;

const clean = (name) => name.replace(/^(\.\/)+/, '').replace(/\/+$/, '');

function effective(header, pending) {
  let { name, size, linkname } = header;
  for (const meta of pending) {
    if (meta.kind === 'pax') {
      const records = paxRecords.parse(meta.data);
      if (records.has('path')) name = records.get('path');
      if (records.has('linkpath')) linkname = records.get('linkpath');
      if (records.has('size')) size = Number(records.get('size'));
    } else if (meta.kind === 'gnu-longname') {
      name = meta.data.toString('utf8').replace(/\0+$/, '');
    } else if (meta.kind === 'gnu-longlink') {
      linkname = meta.data.toString('utf8').replace(/\0+$/, '');
    }
  }
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Tar entry has an invalid size.');
  return { name: clean(name), type: header.type, size, mode: header.mode, linkname };
}

function paxEntry(records, template) {
  const data = paxRecords.serialize(records);
  const header = Buffer.from(template);
  header.fill(0, 157, 257);
  header.write('x', 156, 'ascii');
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  tarBlocks.setName(header, 'PaxHeader');
  return [header, data, tarBlocks.padding(data.length)];
}

// An entry written under a new name. Its old path records are dropped so they can't override
// the new name; other PAX records (large sizes, precise times) are kept. A name too long for
// the ustar fields goes into a PAX path record, as tar itself does.
function renamed(pending, block, name) {
  const records = new Map();
  for (const meta of pending) if (meta.kind === 'pax') for (const [key, value] of paxRecords.parse(meta.data)) records.set(key, value);
  records.delete('path');
  const header = Buffer.from(block);
  try {
    tarBlocks.setName(header, name);
  } catch {
    records.set('path', name);
    tarBlocks.setName(header, Buffer.from(name.split('/').pop()).subarray(0, 100).toString('latin1'));
  }
  return [...(records.size ? paxEntry(records, block) : []), header];
}

// Streams a tar archive through, asking `decide(entry)` about each entry: return null to drop
// it, or the path to write it under (its own path keeps it untouched). File contents pass
// straight through without buffering, so archives of any size stream in constant memory.
// `append()` returns extra entries for the end; `end: false` leaves off the end-of-archive
// blocks so the output can be followed by another archive.
export default function rewriteTar({ decide, append = () => [], end = true }) {
  let buffer = Buffer.alloc(0);
  let state = 'header';
  let remaining = 0;
  let meta = null;
  let pending = [];

  function step(push) {
    while (true) {
      if (state === 'done') {
        buffer = Buffer.alloc(0);
        return;
      }
      if (state === 'data' || state === 'skip') {
        if (!buffer.length) return;
        const take = Math.min(remaining, buffer.length);
        if (state === 'data') push(buffer.subarray(0, take));
        buffer = buffer.subarray(take);
        remaining -= take;
        if (!remaining) state = 'header';
        continue;
      }
      if (state === 'meta') {
        if (buffer.length < remaining) return;
        pending.push({ ...meta, data: Buffer.from(buffer.subarray(0, meta.size)) });
        buffer = buffer.subarray(remaining);
        remaining = 0;
        meta = null;
        state = 'header';
        continue;
      }
      if (buffer.length < 512) return;
      const block = Buffer.from(buffer.subarray(0, 512));
      buffer = buffer.subarray(512);
      const header = parseTarHeader(block);

      if (!header) {
        for (const extra of append()) push(extra);
        if (end) push(tarBlocks.end());
        state = 'done';
        continue;
      }
      if (['pax', 'gnu-longname', 'gnu-longlink'].includes(header.type)) {
        if (header.size > META_LIMIT) throw new Error('Tar metadata header too large.');
        meta = { kind: header.type, header: block, size: header.size };
        remaining = tarBlocks.padded(header.size);
        state = 'meta';
        continue;
      }
      if (header.type === 'pax-global') {
        push(block);
        remaining = tarBlocks.padded(header.size);
        state = remaining ? 'data' : 'header';
        continue;
      }

      const entry = effective(header, pending);
      const target = decide(entry);
      remaining = tarBlocks.padded(entry.size);
      if (target === null || target === undefined) {
        state = remaining ? 'skip' : 'header';
      } else if (target === entry.name) {
        for (const m of pending) push(Buffer.concat([m.header, m.data, tarBlocks.padding(m.data.length)]));
        push(block);
        state = remaining ? 'data' : 'header';
      } else {
        for (const part of renamed(pending, block, entry.type === 'dir' ? `${target}/` : target)) push(part);
        state = remaining ? 'data' : 'header';
      }
      pending = [];
    }
  }

  return new Transform({
    transform(chunk, encoding, callback) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      try {
        step((part) => this.push(part));
        callback();
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      callback(state === 'done' ? null : new Error('The tar archive ended early.'));
    },
  });
}
