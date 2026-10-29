import paper from './paper.mjs';

const COSTS = [
  ['Courtyard and two meeting rooms, three days', '€4,800'],
  ['Lunch and coffee for six, three days', '€1,260'],
  ['Dinner on the first night, Alfama', '€540'],
  ['Six rooms, three nights, breakfast included', '€3,960'],
  ['Projector, screen and video calls kit', 'Included'],
];

// The venue's proposal for the offsite, sitting next to the courtyard photo.
export default paper(
  `<header><b>Palácio do Pátio</b><span>Rua da Saudade 12, Lisbon</span></header>
   <h1>Proposal: Atlas team offsite</h1><p class="muted">Prepared for Dev Rao. Held until Friday for 12 to 14 March or 19 to 21 March.</p>
   <h2>What is included</h2>
   <table><tr><th>Item</th><th>Price</th></tr>${COSTS.map(([item, price]) => `<tr><td>${item}</td><td>${price}</td></tr>`).join('')}
   <tr><td><b>Total, before VAT</b></td><td><b>€10,560</b></td></tr></table>
   <h2>The space</h2><p>A sixteenth-century courtyard with an arcade on three sides, shaded until early afternoon. The meeting rooms open onto it and seat twelve each. Fast wifi throughout, and the lights stay on in the courtyard until midnight.</p>
   <h2>Getting there</h2><p>Twenty minutes from the airport by taxi, five minutes on foot from the Cais do Sodré metro.</p>
   <h2>To confirm</h2><p>A 30% deposit holds the dates. Free cancellation until 1 February.</p>`,
);
