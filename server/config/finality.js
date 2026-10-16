import envNumber from '../lib/envNumber.js';

// Finality for every token payment: a transfer counts once its block is finalized. Nodes on
// chains without the `finalized` tag fall back to this many blocks under the head.
export default Object.freeze({
  depth: envNumber('NOX_FINALITY_DEPTH', 64, { min: 1 }),
});
