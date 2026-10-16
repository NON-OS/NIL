import HttpError from '../lib/HttpError.js';

const bad = () => HttpError.badRequest('That transaction isn’t encoded correctly.');

// Recursive-length-prefix decoding (the yellow paper's appendix B). Returns nested arrays of
// byte strings and refuses non-canonical encodings, so one transaction has exactly one form.
export default function rlpDecode(bytes) {
  function item(at) {
    const p = bytes[at];
    if (p === undefined) throw bad();
    if (p < 0x80) return [bytes.subarray(at, at + 1), at + 1];
    if (p < 0xb8) return str(at + 1, p - 0x80, p === 0x81);
    if (p < 0xc0) return str(...longHead(at, p - 0xb7), false);
    if (p < 0xf8) return list(at + 1, p - 0xc0);
    return list(...longHead(at, p - 0xf7));
  }
  function longHead(at, size) {
    if (bytes[at + 1] === 0) throw bad();
    let length = 0;
    for (let i = 0; i < size; i++) length = length * 256 + bytes[at + 1 + i];
    if (length < 56) throw bad();
    return [at + 1 + size, length];
  }
  function str(start, length, single) {
    if (start + length > bytes.length) throw bad();
    const out = bytes.subarray(start, start + length);
    if (single && out[0] < 0x80) throw bad();
    return [out, start + length];
  }
  function list(start, length) {
    const end = start + length;
    if (end > bytes.length) throw bad();
    const out = [];
    for (let at = start; at < end; ) {
      const [value, next] = item(at);
      out.push(value);
      at = next;
    }
    return [out, end];
  }
  const [value, end] = item(0);
  if (end !== bytes.length) throw bad();
  return value;
}
