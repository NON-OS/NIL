import c from './colours.mjs';
import sheet from './sheet.mjs';

// The homepage hero Ben shares in #design: the headline on ink, with the brand's three shapes.
export default sheet(
  `body{background:${c.ink};color:${c.paper};position:relative;overflow:hidden}
   .copy{position:absolute;left:72px;top:190px}
   h1{margin:0;font-size:84px;line-height:1.02;letter-spacing:-2px;font-weight:800}
   h1 span{color:${c.glow}}
   p{margin:28px 0 0;font-size:22px;color:#9AA1AD;max-width:420px;line-height:1.45}
   .cta{display:inline-block;margin-top:34px;padding:14px 26px;border-radius:999px;background:${c.paper};color:${c.ink};font-weight:700;font-size:18px}
   .shape{position:absolute}
   .circle{width:400px;height:400px;border-radius:50%;background:${c.blue};right:50px;top:100px}
   .triangle{width:0;height:0;border-left:175px solid transparent;border-right:175px solid transparent;border-bottom:250px solid ${c.ember};right:175px;top:75px}
   .square{width:325px;height:275px;background:${c.harbour};right:250px;top:350px}`,
  `<div class="copy"><h1>Money that<br><span>stays yours.</span></h1>
   <p>The Atlas wallet, rebuilt for 2.0. Your keys, your phone, nobody in between.</p>
   <div class="cta">Join the beta</div></div>
   <div class="shape circle"></div><div class="shape triangle"></div><div class="shape square"></div>`,
);
