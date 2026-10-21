import { curves } from 'snarkjs';

const shared = globalThis;
let ready = null;

// snarkjs builds its curve with worker threads started from blob: URLs, which the Content
// Security Policy doesn't allow. A single-threaded curve, built once and left where snarkjs looks
// for it, does the same work in this thread.
export default function singleThreadCurve() {
  ready ??= shared.curve_bn128
    ? Promise.resolve()
    : curves.getCurveFromName('bn128', { singleThread: true }).then((curve) => {
        shared.curve_bn128 ??= curve;
      });
  return ready;
}
