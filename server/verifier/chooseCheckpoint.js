const DAY = 86_400_000;
const SLOT_MS = 12_000;

// Picks the newest checkpoint of the configured one and the one kept from the last run, by the
// slot each really belongs to, and refuses both when even the newer is older than the allowed
// age. A light client started from a checkpoint past the weak-subjectivity period can be led
// onto a fork that old validators signed after leaving, so this check is never skipped.
export default async function chooseCheckpoint({ candidates, slotOf, genesisTime, maxAgeMs, now = Date.now() }) {
  let best = null;
  let lastError = null;
  for (const checkpoint of new Set(candidates.filter(Boolean))) {
    try {
      const slot = await slotOf(checkpoint);
      if (!best || slot > best.slot) best = { checkpoint, slot };
    } catch (err) {
      lastError = err;
    }
  }
  if (!best) {
    const reason = lastError ? lastError.message : 'no checkpoint is set (VERIFIER_CHECKPOINT)';
    throw Object.assign(new Error(`No usable checkpoint: ${reason}.`), { reason: lastError ? 'consensus' : 'checkpoint' });
  }
  const ageMs = now - (genesisTime * 1000 + best.slot * SLOT_MS);
  if (ageMs > maxAgeMs) {
    const days = Math.floor(ageMs / DAY);
    throw Object.assign(new Error(`The newest checkpoint is ${days} days old, more than the ${Math.round(maxAgeMs / DAY)} allowed. Set VERIFIER_CHECKPOINT to a recent finalized block root.`), { reason: 'checkpoint' });
  }
  return { ...best, ageMs };
}
