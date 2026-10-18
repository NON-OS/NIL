// Numbers in proofs and ballots, accepted only in their one canonical spelling. Proof checkers
// read numbers with BigInt and reduce them, so "0"+n, or n plus the field order, verifies just
// like n. The text is what gets stored and compared, and two spellings of one nullifier would
// count one ballot twice, so anything but plain decimal below the order is refused.
const DECIMAL = /^(0|[1-9]\d{0,77})$/;

const canonical = {
  // BN254's scalar field: every public signal, Semaphore commitment and Baby Jubjub coordinate
  scalar: 21888242871839275222246405745257275088548364400416034343698204186575808495617n,
  // BN254's base field: the coordinates of a Groth16 proof's points
  base: 21888242871839275222246405745257275088696311157297823662689037894645226208583n,

  // The value back if it's canonical decimal text below `order`, otherwise null.
  number(value, order = canonical.scalar) {
    if (typeof value !== 'string' || !DECIMAL.test(value)) return null;
    return BigInt(value) < order ? value : null;
  },

  // Every value in a nested array is canonical below `order`.
  all: (values, order = canonical.scalar) => Array.isArray(values) && values.flat(Infinity).every((v) => canonical.number(v, order) !== null),
};

export default canonical;
