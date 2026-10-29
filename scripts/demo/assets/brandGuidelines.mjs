import c from './colours.mjs';
import paper from './paper.mjs';

const SWATCHES = [
  ['Ink', c.ink, 'Text, the dark app icon, and the hero background'],
  ['Atlas blue', c.blue, 'Buttons, links and anything you can press'],
  ['Harbour', c.harbour, 'Money arriving, confirmations, success'],
  ['Ember', c.ember, 'Warnings and the beta badge'],
  ['Orchid', c.orchid, 'Illustration only, never for state'],
];

// Two pages of brand guidelines: a cover, then colour, type and voice.
export default paper(
  `<section class="page cover"><p class="muted">Northwind · Brand</p><h1>Atlas 2.0<br>brand guidelines</h1>
     <p>Version 2.0, October. Owner: Ben Hart.</p>
     <div class="shapes"><span style="background:${c.blue};border-radius:50%"></span><span style="background:${c.ember}"></span><span style="background:${c.harbour}"></span></div></section>
   <section><header><b>Atlas 2.0 brand guidelines</b><span>Page 2</span></header>
     <h2>Colour</h2>
     <table><tr><th></th><th>Name</th><th>Hex</th><th>Use it for</th></tr>
     ${SWATCHES.map(([name, hex, use]) => `<tr><td><i style="background:${hex}"></i></td><td>${name}</td><td>${hex}</td><td>${use}</td></tr>`).join('')}</table>
     <h2>Type</h2><p>Geist for everything on screen, at three weights: regular for reading, medium for labels, bold for numbers that matter. JetBrains Mono for addresses and amounts in tables.</p>
     <h2>Voice</h2><p>We write like a calm friend who knows money. Plain words, numbers over adjectives, and when something fails we say what happened and what to do next. The Brand voice doc has the full word list.</p>
     <h2>Logo</h2><p>The triangle mark sits on a rounded tile. Keep a quarter of the tile clear on every side, and never put the mark on a photo without the tile.</p></section>`,
  `@page:first{margin:0}
   .cover{height:296mm;display:flex;flex-direction:column;justify-content:center;background:${c.ink};color:${c.paper};padding:0 20mm}
   .cover h1{font-size:44pt;line-height:1.05;margin:10px 0 14px}
   .shapes{display:flex;gap:14px;margin-top:40px}.shapes span{width:60px;height:60px}
   td i{display:block;width:26px;height:26px;border-radius:6px}`,
);
