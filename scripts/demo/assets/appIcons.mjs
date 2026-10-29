import c from './colours.mjs';
import sheet from './sheet.mjs';

const VARIANTS = [
  { name: 'light', tile: c.paper, glyph: c.blue },
  { name: 'dark', tile: c.ink, glyph: c.paper },
  { name: 'beta', tile: c.ember, glyph: c.paper, tag: 'BETA' },
];

const icon = ({ tile, glyph, tag }) =>
  sheet(
    `body{background:transparent;display:grid;place-items:center}
     .tile{width:450px;height:450px;border-radius:104px;background:${tile};display:grid;place-items:center;position:relative;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
     .tag{position:absolute;bottom:52px;padding:6px 16px;border-radius:999px;background:${c.ink};color:#fff;font-weight:800;font-size:22px;letter-spacing:3px}`,
    `<div class="tile"><svg viewBox="0 0 100 100" width="250"><path d="M50 10 90 90H10Z" fill="none" stroke="${glyph}" stroke-width="11" stroke-linejoin="round"/><path d="M22 66h56" stroke="${glyph}" stroke-width="11"/></svg>${tag ? `<span class="tag">${tag}</span>` : ''}</div>`,
  );

// The app icon in its three versions.
export default VARIANTS.map((v) => ({ file: `Atlas icon - ${v.name}.png`, html: icon(v) }));
