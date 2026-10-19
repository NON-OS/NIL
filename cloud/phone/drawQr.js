import qr from './qr.js';

const SVG = 'http://www.w3.org/2000/svg';
const QUIET = 4;

// A QR code built as SVG elements in the page, the way the web app draws one, so the pairing link
// never goes to an image service and the page's policy needs no data: images or inline styles.
// Its colours come from signup.css.
export default function drawQr(value, label, size) {
  const modules = qr(value);
  let d = '';
  modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`)));
  const extent = String(modules.length + QUIET * 2);
  const svg = document.createElementNS(SVG, 'svg');
  const attrs = { class: 'qr', role: 'img', 'aria-label': label, width: String(size), height: String(size), viewBox: `0 0 ${extent} ${extent}`, 'shape-rendering': 'crispEdges' };
  for (const [name, v] of Object.entries(attrs)) svg.setAttribute(name, v);
  const ground = document.createElementNS(SVG, 'rect');
  ground.setAttribute('width', extent);
  ground.setAttribute('height', extent);
  const dots = document.createElementNS(SVG, 'path');
  dots.setAttribute('d', d);
  svg.append(ground, dots);
  return svg;
}
