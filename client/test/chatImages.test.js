import { test } from 'node:test';
import assert from 'node:assert/strict';
import stripImageMetadata from '../src/lib/images/stripImageMetadata.ts';
import jpegOrientation from '../src/lib/images/jpegOrientation.ts';

// Pictures sent in chat lose where they were taken before they're encrypted. Built by hand here:
// a JPEG with Exif (GPS and an orientation), XMP and a comment; a PNG with text and Exif chunks;
// a WebP with EXIF and XMP; a GIF with a comment and XMP beside its loop count.
const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : [...p])));
const has = (data, text) => Buffer.from(data).includes(Buffer.from(text, 'latin1'));
const seg = (marker, ...data) => {
  const body = bytes(...data);
  return [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
};

function exif(orientation) {
  // big-endian TIFF, IFD0 with orientation and a GPS pointer, then a GPS IFD naming a place
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 2, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0];
  return bytes('Exif\0\0', tiff, 'GPSLatitude 59.3293 N GPSLongitude 18.0686 E');
}

test('a JPEG keeps its picture and turn, and loses Exif, GPS, XMP and comments', () => {
  const scan = bytes([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0], 'PIXELS', [0xff, 0xd9]);
  const jpeg = bytes([0xff, 0xd8], seg(0xe0, 'JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0]), seg(0xe1, exif(6)), seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Stockholm</x:xmpmeta>'), seg(0xed, 'Photoshop 3.0\0IPTC city'), seg(0xfe, 'shot by Vic'), seg(0xdb, [0, 1, 2, 3]), scan);
  assert.equal(jpegOrientation(exif(6)), 6);
  const clean = stripImageMetadata.run(jpeg, 'image/jpeg');
  for (const leak of ['GPSLatitude', 'Stockholm', 'IPTC', 'shot by Vic']) assert.ok(!has(clean, leak), leak);
  assert.ok(has(clean, 'JFIF') && has(clean, 'PIXELS'));
  // JFIF first, then an Exif block that says only which way up
  assert.deepEqual([...clean.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  const app1 = Buffer.from(clean).indexOf(Buffer.from([0xff, 0xe1]));
  assert.ok(app1 > 0);
  assert.equal(jpegOrientation(clean.subarray(app1 + 4)), 6);
  // a second picture hidden after the end, with its own Exif and GPS, goes too
  const motion = stripImageMetadata.run(bytes(jpeg, [0xff, 0xd8], seg(0xe1, exif(1)), 'GPSLatitude 1 N', [0xff, 0xd9]), 'image/jpeg');
  assert.ok(!has(motion, 'GPSLatitude') && has(motion, 'PIXELS'));
  assert.deepEqual([...motion.subarray(-2)], [0xff, 0xd9]);
  // an upright photo gets no Exif at all
  const upright = stripImageMetadata.run(bytes([0xff, 0xd8], seg(0xe1, exif(1)), scan), 'image/jpeg');
  assert.ok(!has(upright, 'Exif'));
});

test('PNG, WebP and GIF lose their metadata chunks and keep the rest', () => {
  const chunk = (type, data) => {
    const body = bytes(data);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return [...len, ...Buffer.from(type), ...body, 0, 0, 0, 0];
  };
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk('IHDR', 'header-13-b'), chunk('tEXt', 'Location\0Oslo'), chunk('eXIf', 'GPS'), chunk('iTXt', 'XML:com.adobe.xmp\0Bergen'), chunk('IDAT', 'PIXELS'), chunk('IEND', ''));
  const cleanPng = stripImageMetadata.run(png, 'image/png');
  assert.ok(!has(cleanPng, 'Oslo') && !has(cleanPng, 'Bergen') && !has(cleanPng, 'eXIf'));
  assert.ok(has(cleanPng, 'IHDR') && has(cleanPng, 'PIXELS') && has(cleanPng, 'IEND'));

  const riff = (name, data) => {
    const body = bytes(data);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(body.length);
    return [...Buffer.from(name), ...size, ...body, ...(body.length % 2 ? [0] : [])];
  };
  const inner = bytes('WEBP', riff('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), riff('VP8 ', 'PIXELS'), riff('EXIF', 'GPS Turku'), riff('XMP ', 'Tampere'));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(inner.length);
  const webp = bytes('RIFF', [...size], inner);
  const cleanWebp = stripImageMetadata.run(webp, 'image/webp');
  assert.ok(!has(cleanWebp, 'Turku') && !has(cleanWebp, 'Tampere') && has(cleanWebp, 'PIXELS'));
  assert.equal(cleanWebp[20] & 0x0c, 0, 'VP8X no longer announces Exif or XMP');
  assert.equal(Buffer.from(cleanWebp).readUInt32LE(4), cleanWebp.length - 8);

  const gif = bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x21, 0xff, 11], 'NETSCAPE2.0', [3, 1, 0, 0, 0], [0x21, 0xff, 11], 'XMP DataXMP', [7], 'Reykjav', [0], [0x21, 0xfe, 5], 'Vigo!', [0], [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0], [0x3b]);
  const cleanGif = stripImageMetadata.run(gif, 'image/gif');
  assert.ok(!has(cleanGif, 'Reykjav') && !has(cleanGif, 'Vigo') && has(cleanGif, 'NETSCAPE2.0'));
  assert.equal(cleanGif[cleanGif.length - 1], 0x3b);
});

test('a picture Nil can’t clean isn’t sent; one with nothing to clean goes as it is', () => {
  assert.throws(() => stripImageMetadata.run(bytes('....ftypheic'), 'image/heic'), /can’t remove the location/);
  const svg = bytes('<svg/>');
  assert.equal(stripImageMetadata.run(svg, 'image/svg+xml'), svg);
  assert.throws(() => stripImageMetadata.run(bytes('not a jpeg'), 'image/jpeg'));
});
