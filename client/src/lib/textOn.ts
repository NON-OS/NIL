// White or ink for text on a fill, whichever contrasts more. Member colours are picked by
// people, and some of them are too light to carry white initials.
const HEX = /^#[0-9a-f]{6}$/i;
// the value of --ink, which CSS variables can't hand to a calculation
const INK = '#0a0b0d';

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

export default function textOn(fill: string): string {
  if (!HEX.test(fill)) return '#fff';
  const l = luminance(fill);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (luminance(INK) + 0.05);
  return onInk > onWhite ? 'var(--ink)' : '#fff';
}
