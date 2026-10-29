// The orientation an Exif block (the APP1 segment's data, after its length) gives a photo, 1 to
// 8, or 1 when it names none. Phones store a photo as the sensor saw it and say here how to turn
// it, so keeping only this one value keeps photos the right way up.
export default function jpegOrientation(app1: Uint8Array) {
  if (app1.length < 14 || String.fromCharCode(...app1.subarray(0, 4)) !== 'Exif') return 1;
  const tiff = app1.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = tiff[0] === 0x49;
  if (!little && tiff[0] !== 0x4d) return 1;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return 1;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return 1;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    const value = view.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}
