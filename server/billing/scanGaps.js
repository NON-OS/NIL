import billingState from './billingState.js';

const KEEP = 20;

// Block ranges the treasury scan had to skip because the node no longer serves their logs, per
// token. A payment sent in one of them is only found if an admin names its transaction, so the
// invoices it could belong to say so. Touching or overlapping ranges are kept as one.
const scanGaps = {
  all: () => billingState.get('scanGaps', []),

  add({ token, from, to, at }) {
    const gaps = scanGaps.all();
    const last = gaps.findLast((g) => g.token === token);
    if (last && from <= last.to + 1 && to >= last.from - 1) {
      last.from = Math.min(last.from, from);
      last.to = Math.max(last.to, to);
      last.at = at;
    } else {
      gaps.push({ token, from, to, at });
    }
    billingState.set('scanGaps', gaps.slice(-KEEP));
  },

  // the skipped ranges in one token that reach into blocks at or after `fromBlock`
  after: (token, fromBlock) => scanGaps.all().filter((g) => g.token === token && g.to >= fromBlock),
};

export default scanGaps;
