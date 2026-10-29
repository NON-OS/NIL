import brandPaths from '../../components/brand/brandPaths';

// A NØNOS scene where a camera is off: on a person's tile, behind who you're calling, on a
// ringing call. Each is flat ink with the official Ø, drawn from the brand kit's own path, and
// the thin teal lines the rest of Nil uses. Each person keeps the same one, picked from their
// account id, so everyone in a call sees the same scene for them. Nothing is fetched.
const INK = '#0A0B0D';
const CYAN = '#66FFFF';
const TEAL = '#007C85';
const W = 1600;
const H = 900;
const GLYPH = brandPaths.icon[0].d;
const GLYPH_W = 188;
const GLYPH_H = 204;

// the Ø with its top left at x, y and the given height: solid, or as a fine outline
function mark(x: number, y: number, h: number, outline = false) {
  const paint = outline ? `fill="none" stroke="${CYAN}" stroke-width="1.5" vector-effect="non-scaling-stroke"` : `fill="${CYAN}"`;
  return `<path transform="translate(${x} ${y}) scale(${h / GLYPH_H})" d="${GLYPH}" ${paint}/>`;
}
const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${TEAL}" stroke-width="1.5"/>`;
const arc = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TEAL}" stroke-width="1.5"/>`;
const wide = (h: number) => (h * GLYPH_W) / GLYPH_H;

const SCENES = [
  // a large outline crossing the right side
  mark(W * 0.5, -H * 0.28, H * 1.55, true),
  // a large outline rising from the bottom left
  mark(-W * 0.1, H * 0.28, H * 1.35, true),
  // arcs from the far corner, the mark small at the top left
  [380, 620, 860].map((r) => arc(W, H, r)).join('') + mark(72, 72, 76),
  // one rule across, the mark resting on it
  line(0, H * 0.7, W, H * 0.7) + mark(W - 150 - wide(84), H * 0.7 - 84 - 24, 84),
  // the outline behind the face, centred
  mark((W - wide(H * 1.2)) / 2, -H * 0.1, H * 1.2, true),
  // columns of thin rules, the mark at the bottom left
  [1, 2, 3, 4, 5, 6, 7].map((i) => line(i * 200, 0, i * 200, H)).join('') + mark(72, H - 72 - 76, 76),
].map((inner) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="${INK}"/>${inner}</svg>`;
  // parentheses too, since the address goes into an unquoted css url()
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;
});

// FNV-1a over the id: quick, stable, and spread evenly enough over a handful of scenes
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export default function callScene(id: string | null | undefined): string | null {
  if (!id) return null;
  return SCENES[hash(id) % SCENES.length];
}
