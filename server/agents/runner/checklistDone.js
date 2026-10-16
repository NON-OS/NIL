import findTaskByKey from '../../services/findTaskByKey.js';
import checkWorkProduct from './checkWorkProduct.js';

const find = (items, ref) => {
  const key = String(ref ?? '').trim();
  return items.find((i) => i.id === key) ?? items.find((i) => i.text.trim().toLowerCase() === key.toLowerCase()) ?? null;
};

// Splits a built-in agent's update_task call into what may run and what can't be ticked. Each
// checklistDone entry needs a result that is the work itself (see checkWorkProduct). A plain
// checklistTick carries no result, so it ticks nothing. Returns the input to run, or null when
// nothing is left once the refused ticks are taken out; the items ticked, with their results;
// and the items refused, with why.
export default function checklistDone(input, viewer) {
  const { checklistDone: done = [], checklistTick: ticks = [], ...rest } = input;
  if (!done.length && !ticks.length) return { input, accepted: [], refused: [] };
  let items;
  try {
    items = findTaskByKey(input.key, viewer).checklist;
  } catch {
    // the call fails on its own (no such task, out of reach); nothing gets ticked either way
    return { input: rest, accepted: [], refused: [] };
  }
  const accepted = [];
  const refused = [];
  for (const entry of done) {
    const item = find(items, entry?.id);
    if (!item) {
      refused.push({ text: String(entry?.id ?? ''), reason: 'there’s no such item on this task' });
      continue;
    }
    const reason = checkWorkProduct(entry.result, item.text);
    if (reason) refused.push({ text: item.text, reason });
    else if (!accepted.some((a) => a.id === item.id)) accepted.push({ id: item.id, text: item.text, result: String(entry.result).trim() });
  }
  for (const ref of ticks) {
    const item = find(items, ref);
    refused.push({ text: item?.text ?? String(ref), reason: 'it was ticked without a result; use checklistDone with what was produced for it' });
  }
  const out = accepted.length ? { ...rest, checklistTick: accepted.map((a) => a.id) } : rest;
  return { input: Object.keys(out).length > 1 ? out : null, accepted, refused };
}
