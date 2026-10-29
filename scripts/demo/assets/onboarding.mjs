import c from './colours.mjs';
import sheet from './sheet.mjs';

// What sits in the middle of each screen's card
const MARKS = {
  logo: '<svg viewBox="0 0 100 100" width="120"><path d="M50 12 88 88H12Z" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round"/><path d="M23 66h54" stroke="#fff" stroke-width="9"/></svg>',
  ring: '<svg viewBox="0 0 100 100" width="96"><circle cx="50" cy="50" r="38" fill="none" stroke="#fff" stroke-width="10"/></svg>',
  face: '<svg viewBox="0 0 100 100" width="110"><path d="M10 32V18q0-8 8-8h14M68 10h14q8 0 8 8v14M90 68v14q0 8-8 8H68M32 90H18q-8 0-8-8V68" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M36 38v6M64 38v6M50 40v16h-5M36 66q14 10 28 0" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>',
};
const STEPS = [
  { file: 'Onboarding 1 - Welcome to Atlas.png', colour: c.blue, mark: 'logo', title: 'Welcome to Atlas', body: 'A wallet that keeps your money on your phone, and only there.' },
  { file: 'Onboarding 2 - Back up your phrase.png', colour: c.harbour, mark: 'ring', title: 'Back up your phrase', body: 'Write down these 12 words in order. They are the only way back in.' },
  { file: 'Onboarding 3 - Unlock with Face ID.png', colour: c.orchid, mark: 'face', title: 'Unlock with Face ID', body: 'Open Atlas with a glance. Your phrase stays the way back if you change phones.' },
];

const CSS = `body{background:${c.paper};color:${c.ink};padding:84px 22px 34px;display:flex;flex-direction:column;height:100%}
  .card{height:330px;border-radius:28px;display:grid;place-items:center}
  h1{margin:40px 0 0;font-size:31px;letter-spacing:-.6px}
  p{margin:12px 0 0;font-size:17px;line-height:1.45;color:${c.muted};max-width:310px}
  .dots{display:flex;gap:8px;margin-top:auto;justify-content:center}
  .dots i{width:8px;height:8px;border-radius:4px;background:#C9CDD4}
  .dots i.on{width:24px;background:${c.ink}}
  .go{margin-top:24px;height:54px;border-radius:27px;background:${c.ink};color:#fff;display:grid;place-items:center;font-weight:700;font-size:17px}`;

const screen = (s, n) =>
  sheet(CSS, `<div class="card" style="background:${s.colour}">${MARKS[s.mark]}</div><h1>${s.title}</h1><p>${s.body}</p>
    <div class="dots">${STEPS.map((_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div><div class="go">${n === STEPS.length - 1 ? 'Open my wallet' : 'Continue'}</div>`);

// Three onboarding screens at an iPhone's size, as Ben exported them from the design file.
export default STEPS.map((s, n) => ({ file: s.file, html: screen(s, n) }));
