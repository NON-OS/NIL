import paper from './paper.mjs';

const TERMS = [
  ['Purpose', 'The parties are discussing a hardware wallet integration between the Atlas app and Helix Labs devices, and will share information to do so.'],
  ['Confidential information', 'Anything shared for that purpose that is marked confidential, or that a reasonable person would understand to be confidential, including source code, device specifications and roadmaps.'],
  ['Obligations', 'Each party keeps the other’s confidential information private, uses it only for the purpose, and shares it only with staff who need it and are bound by the same terms.'],
  ['Exclusions', 'Information that is public, already known to the receiving party, independently developed, or received from a third party without restriction.'],
  ['Term', 'Two years from the date below. Obligations on information shared during the term last three years after it ends.'],
  ['Law', 'This agreement is governed by the laws of Portugal, and the courts of Lisbon have jurisdiction.'],
];

// A signed mutual NDA with a hardware partner, the kind of file that lives in Contracts.
export default paper(
  `<header><b>Northwind</b><span>Mutual non-disclosure agreement</span></header>
   <h1>Mutual NDA</h1><p class="muted">Between Northwind Ltd and Helix Labs GmbH, 14 October</p>
   ${TERMS.map(([h, p], i) => `<h2>${i + 1}. ${h}</h2><p>${p}</p>`).join('')}
   <div class="signs"><div><span class="sig">Ada Okafor</span><p>Ada Okafor, for Northwind Ltd</p></div><div><span class="sig">J. Brandt</span><p>Jonas Brandt, for Helix Labs GmbH</p></div></div>`,
  `.signs{display:flex;gap:40px;margin-top:70px}.signs div{flex:1;border-top:1px solid #9AA1AD;padding-top:6px}
   .sig{display:block;margin-top:-40px;height:34px;font:italic 22pt Georgia,'DejaVu Serif',serif;color:#2b3a8f}
   .signs p{margin:0;font-size:9pt;color:#5B6270}`,
);
