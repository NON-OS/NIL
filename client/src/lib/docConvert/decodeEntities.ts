// The entity references people write in Markdown by hand, by code point. Numeric ones always
// decode; a named one this doesn't know stays as written.
const NAMED: Record<string, number> = {
  amp: 0x26,
  lt: 0x3c,
  gt: 0x3e,
  quot: 0x22,
  apos: 0x27,
  nbsp: 0xa0,
  copy: 0xa9,
  reg: 0xae,
  trade: 0x2122,
  hellip: 0x2026,
  mdash: 0x2014,
  ndash: 0x2013,
  lsquo: 0x2018,
  rsquo: 0x2019,
  ldquo: 0x201c,
  rdquo: 0x201d,
  laquo: 0xab,
  raquo: 0xbb,
  middot: 0xb7,
  bull: 0x2022,
  deg: 0xb0,
  times: 0xd7,
  euro: 0x20ac,
};
const REPLACEMENT = 0xfffd;

export default function decodeEntities(text: string) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ? String.fromCodePoint(NAMED[ref]) : whole;
    const code = /^#[xX]/.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return String.fromCodePoint(code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? code : REPLACEMENT);
  });
}
