import jpegOrientation from './jpegOrientation';

// Segments a JPEG keeps: JFIF (APP0), colour profiles (APP2 "ICC_PROFILE") and Adobe's colour
// transform (APP14), which change how the picture looks and say nothing about who took it where.
const keeps = (marker: number, data: Uint8Array) =>
  marker === 0xe0 || marker === 0xee || (marker === 0xe2 && String.fromCharCode(...data.subarray(0, 11)) === 'ICC_PROFILE');

// A minimal Exif block that says only which way up the photo goes.
function orientationOnly(value: number) {
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0];
  const data = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return [0xff, 0xe1, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
}

// Where a scan's coded data ends: the first marker that isn't a stuffed byte or a restart.
function scanEnd(bytes: Uint8Array, from: number) {
  for (let j = from; j + 1 < bytes.length; j++) {
    if (bytes[j] !== 0xff) continue;
    const next = bytes[j + 1];
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) continue;
    return j;
  }
  return bytes.length;
}

// A JPEG without its Exif (camera, time, GPS position), XMP, IPTC, comments and every other
// application segment, and without anything after the picture ends: phones put more pictures
// there, with metadata of their own. The picture data is copied as it is, nothing re-encoded.
export default function stripJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('This isn’t a JPEG.');
  const out: number[][] = [[0xff, 0xd8]];
  let orientation = 1;
  let i = 2;
  let ended = false;
  while (i + 2 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('This JPEG is damaged.');
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // end of the picture: whatever follows is dropped
    if (marker === 0xd9) {
      out.push([0xff, 0xd9]);
      ended = true;
      break;
    }
    if (i + 4 > bytes.length) throw new Error('This JPEG is damaged.');
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) throw new Error('This JPEG is damaged.');
    const data = bytes.subarray(i + 4, i + 2 + length);
    // a scan: its header, then the coded picture data up to the next marker
    if (marker === 0xda) {
      const end = scanEnd(bytes, i + 2 + length);
      out.push([...bytes.subarray(i, end)]);
      i = end;
      continue;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1 && orientation === 1) orientation = jpegOrientation(data);
    if ((!isApp && marker !== 0xfe) || keeps(marker, data)) out.push([...bytes.subarray(i, i + 2 + length)]);
    i += 2 + length;
  }
  if (!ended) throw new Error('This JPEG is damaged.');
  // the orientation goes after JFIF, which has to come first, or straight after the start
  if (orientation !== 1) out.splice(out[1]?.[1] === 0xe0 ? 2 : 1, 0, orientationOnly(orientation));
  return Uint8Array.from(out.flat());
}
