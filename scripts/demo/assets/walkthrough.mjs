import c from './colours.mjs';
import sheet from './sheet.mjs';

const SCREENS = [
  [c.blue, 'Welcome to Atlas'],
  [c.harbour, 'Back up your phrase'],
  [c.orchid, 'Unlock with Face ID'],
];
const SECONDS = 5;

// A few seconds of the 2.0 walkthrough Dev is cutting: the three onboarding screens sliding
// past in a phone, with a caption and a progress bar.
export default sheet(
  `body{background:${c.ink};color:${c.paper};display:grid;place-items:center;overflow:hidden}
   .stage{display:flex;align-items:center;gap:80px}
   .phone{width:250px;height:520px;border-radius:40px;background:#1c1e22;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
   .screen{width:100%;height:100%;border-radius:30px;overflow:hidden;background:${c.paper}}
   .strip{display:flex;width:300%;height:100%;animation:slide ${SECONDS}s ease-in-out infinite}
   .card{flex:1;padding:40px 22px;color:${c.ink}}
   .card div{height:200px;border-radius:20px}
   .card b{display:block;margin-top:28px;font-size:22px}
   h1{font-size:54px;letter-spacing:-1.5px;margin:0;line-height:1.05}
   h1 span{color:${c.glow}}
   .bar{margin-top:30px;width:360px;height:6px;border-radius:3px;background:#2a2d33;overflow:hidden}
   .bar i{display:block;height:100%;background:${c.glow};animation:fill ${SECONDS}s linear infinite}
   @keyframes slide{0%,25%{transform:translateX(0)}35%,60%{transform:translateX(-33.333%)}70%,100%{transform:translateX(-66.666%)}}
   @keyframes fill{from{width:0}to{width:100%}}`,
  `<div class="stage"><div class="phone"><div class="screen"><div class="strip">
   ${SCREENS.map(([colour, title]) => `<div class="card"><div style="background:${colour}"></div><b>${title}</b></div>`).join('')}
   </div></div></div><div><h1>Atlas 2.0<br><span>in two minutes.</span></h1><div class="bar"><i></i></div></div></div>`,
);
