const OPEN = new Set([0x5b, 0x7b]);
const CLOSE = new Set([0x5d, 0x7d]);
const QUOTE = 0x22;
const BACKSLASH = 0x5c;

// A body-parser `verify` hook that refuses JSON nested deeper than `max` before it is parsed.
// Parsing deep JSON is fine, but code that walks the result recursively (JSON.stringify among
// it) runs out of stack, so a small body could fail every request it reached. Brackets inside
// strings don't count.
export default function jsonDepthLimit(max) {
  return (req, res, buf) => {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (inString) {
        if (c === BACKSLASH) i++;
        else if (c === QUOTE) inString = false;
      } else if (c === QUOTE) inString = true;
      else if (OPEN.has(c) && ++depth > max) {
        throw Object.assign(new Error(`JSON nested deeper than ${max} levels`), { status: 400, type: 'entity.too.deep' });
      } else if (CLOSE.has(c)) depth--;
    }
  };
}
