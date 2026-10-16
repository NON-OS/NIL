// A scalar as 32 big-endian bytes, and back.
const scalarBytes = {
  to: (n: bigint) => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g)!.map((h) => parseInt(h, 16))),
  from: (b: Uint8Array) => BigInt(`0x${[...b].map((x) => x.toString(16).padStart(2, '0')).join('') || '0'}`),
};

export default scalarBytes;
