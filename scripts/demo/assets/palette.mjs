import c from './colours.mjs';
import sheet from './sheet.mjs';

const SWATCHES = [
  ['Ink', c.ink],
  ['Atlas blue', c.blue],
  ['Harbour', c.harbour],
  ['Ember', c.ember],
  ['Orchid', c.orchid],
];

// The palette sheet from the brand update, the one the team votes on.
export default sheet(
  `body{background:${c.paper};color:${c.ink};padding:28px 40px}
   h1{margin:0 0 22px;font-size:26px;letter-spacing:-.5px}
   .row{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}
   .chip{height:250px;border-radius:14px}
   b{display:block;margin-top:14px;font-size:17px}
   code{font:14px ui-monospace,'DejaVu Sans Mono',monospace;color:${c.muted}}`,
  `<h1>Atlas 2.0 palette</h1><div class="row">${SWATCHES.map(([name, hex]) => `<div><div class="chip" style="background:${hex}"></div><b>${name}</b><code>${hex}</code></div>`).join('')}</div>`,
);
