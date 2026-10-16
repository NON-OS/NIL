// Arithmetic in GF(256) with the QR code polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const multiply = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// The Reed-Solomon error correction codewords for one block: the remainder of the data,
// shifted up by `degree`, divided by the generator (x - a^0)(x - a^1)...(x - a^(degree-1)).
export default function reedSolomon(data: number[], degree: number): number[] {
  let generator = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(generator.length + 1).fill(0);
    generator.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= multiply(c, EXP[i]);
    });
    generator = next;
  }
  const work = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor) for (let j = 0; j < generator.length; j++) work[i + j] ^= multiply(generator[j], factor);
  }
  return work.slice(data.length);
}
