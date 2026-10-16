import configWarning from '../lib/configWarning.js';

// "3/50": this server is workspace number 3 of 50 that share PLAN_TREASURY. Each one then
// draws invoice suffixes from its own share, so no two workspaces can ever ask for the same amount.
export default function invoiceSlot(raw, digits) {
  if (!raw) return null;
  const match = /^(\d+)\/(\d+)$/.exec(raw);
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!(count >= 1 && index < count && Math.floor((10 ** digits - 1) / count) >= 1)) {
    configWarning(`PLAN_INVOICE_SLOT=${raw} isn’t index/count with an index below the count and room for every slot in PLAN_SUFFIX_DIGITS. Invoices fall back to random suffixes.`);
    return null;
  }
  return Object.freeze({ index, count });
}
