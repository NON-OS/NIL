import sheet from './sheet.mjs';

const windows = (n, cls) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('');

// Something like a photo of the courtyard Dev shortlisted for the offsite: a lime-washed palace
// wall with an arcade, cobbles, an olive tree and string lights, late in the afternoon.
export default sheet(
  `body{position:relative;overflow:hidden;background:linear-gradient(#8fbfe0,#cfe3ee 40%,#f3dfc0 62%)}
   .wall{position:absolute;left:-20px;right:-20px;top:120px;height:380px;background:linear-gradient(90deg,#e9d6b8,#f2e4cc 45%,#e2cba8);box-shadow:0 -6px 0 #c9ab82}
   .roof{position:absolute;left:-20px;right:-20px;top:104px;height:22px;background:repeating-linear-gradient(90deg,#b5603c 0 18px,#a4532f 18px 22px)}
   .floor1,.floor2,.arcade{position:absolute;left:60px;right:60px;display:flex;justify-content:space-between}
   .floor1{top:150px}.floor2{top:250px}.arcade{top:350px}
   .w{width:58px;height:78px;border-radius:29px 29px 4px 4px;background:linear-gradient(#3e5566,#56707f);box-shadow:0 0 0 6px #fbf6ec}
   .a{width:96px;height:150px;border-radius:48px 48px 0 0;background:linear-gradient(#3a3027,#5b4a3a);box-shadow:inset 0 18px 30px rgba(0,0,0,.45),0 0 0 8px #f7eedd}
   .ground{position:absolute;left:-200px;right:-200px;top:498px;height:400px;transform-origin:top;transform:perspective(500px) rotateX(58deg);
     background:repeating-linear-gradient(90deg,#cdbfa8 0 34px,#b9aa91 34px 38px),#c8b89e;background-blend-mode:multiply}
   .sun{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,214,150,.0) 40%,rgba(255,214,150,.35) 60%,rgba(255,214,150,0) 75%)}
   .shade{position:absolute;left:0;width:420px;top:120px;bottom:0;background:linear-gradient(90deg,rgba(40,30,20,.35),rgba(40,30,20,0))}
   .trunk{position:absolute;left:720px;top:380px;width:22px;height:200px;background:linear-gradient(90deg,#4b3a2a,#6d553d);border-radius:8px}
   .leaf{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 35%,#8a9a5b,#56663a 70%)}
   .vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 55% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.35))}
   svg{position:absolute;inset:0}`,
  `<div class="roof"></div><div class="wall"></div>
   <div class="floor1">${windows(7, 'w')}</div><div class="floor2">${windows(7, 'w')}</div><div class="arcade">${windows(6, 'a')}</div>
   <div class="ground"></div><div class="shade"></div>
   <div class="trunk"></div>
   <div class="leaf" style="left:640px;top:300px;width:150px;height:110px"></div><div class="leaf" style="left:700px;top:270px;width:150px;height:120px"></div><div class="leaf" style="left:670px;top:340px;width:170px;height:100px"></div>
   <svg viewBox="0 0 1000 667"><path d="M0 120 Q250 230 500 150 T1000 130" fill="none" stroke="#3a3027" stroke-width="1.5"/>
   ${Array.from({ length: 21 }, (_, i) => `<circle cx="${i * 50}" cy="${140 + Math.round(40 * Math.sin((i / 20) * Math.PI * 2 - 0.4))}" r="4" fill="#ffe7a3"/>`).join('')}
   <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>
   <rect width="1000" height="667" filter="url(#grain)" opacity=".35"/></svg>
   <div class="sun"></div><div class="vignette"></div>`,
);
