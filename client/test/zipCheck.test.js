import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

const zipCheck = (await import('../src/lib/zipCheck.ts')).default;

// A minimal zip with the given files, each deflated, and a central directory that may lie.
function zip(files, { claim } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(claim ?? content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(claim ?? content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const limits = { maxEntries: 10, maxBytes: 1024 * 1024, message: 'too big' };

test('a zip within the limits passes; one that inflates past them is refused, whatever it claims', async () => {
  await zipCheck(zip([['word/document.xml', Buffer.from('<w:document/>')]]), limits);
  const bomb = Buffer.alloc(5 * 1024 * 1024);
  await assert.rejects(zipCheck(zip([['word/document.xml', bomb]]), limits), /too big/);
  await assert.rejects(zipCheck(zip([['word/document.xml', bomb]], { claim: 10 }), limits), /too big/);
  await assert.rejects(zipCheck(zip(Array.from({ length: 11 }, (_, i) => [`f${i}`, Buffer.from('x')])), limits), /too big/);
  await assert.rejects(zipCheck(new Uint8Array(100), limits), /too big/);
});
