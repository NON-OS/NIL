import brandPaths from '../../components/brand/brandPaths';

// The official light logo (cyan mark, ink letters) drawn to a PNG for slides, since not every
// presentation app reads SVG. Rendered from the brand kit's own paths, never retyped.
export default async function logoPng(height = 200) {
  const width = Math.round((height * 1428) / 500);
  const paths = brandPaths.logo
    .map((p) => {
      const colour = p.part === 'mark' ? '#66FFFF' : '#0A0B0D';
      const paint = p.paint === 'stroke' ? `stroke="${colour}" fill="none"` : `fill="${colour}"`;
      return `<path d="${p.d}" ${paint}${p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1428 500">${paths}</svg>`;
  const image = new Image();
  image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);
  return { data: canvas.toDataURL('image/png'), ratio: width / height };
}
