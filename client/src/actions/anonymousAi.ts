import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import unlockPrivateKeys from './unlockPrivateKeys';
import registerVotingKey from './registerVotingKey';
import utcDay from '../lib/aiCredit/utcDay';
import freeSlot from '../lib/aiCredit/freeSlot';
import creditScope from '../lib/aiCredit/creditScope';
import creditMessage from '../lib/aiCredit/creditMessage';
import type AiCredits from '../types/AiCredits';
import type { Identity } from '@semaphore-protocol/identity';

// The member list and today's spent nullifiers, fetched while signed in and kept a few minutes,
// so most requests don't follow a signed-in fetch. A stale copy only costs one retry.
const FRESH_MS = 5 * 60_000;
let held: { at: number; credits: AiCredits } | null = null;

async function credits({ force = false } = {}) {
  if (!force && held && Date.now() - held.at < FRESH_MS && held.credits.day === utcDay()) return held.credits;
  const fetched = await http.get<AiCredits>('/ai-credits');
  held = { at: Date.now(), credits: fetched };
  return fetched;
}

const KEY_CHANGED = 'Your voting key changed after a key reset and isn’t on the member list yet. Nil registers the new one once the anonymous votes you joined with the old one have closed.';
const NOT_LISTED = 'Your voting key isn’t on the member list right now.';

// a short random pause, so the request doesn't arrive in step with the page's signed-in ones
const jitter = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 1200));

async function attempt<T>(feature: string, payload: string, id: Identity, force: boolean) {
  const c = await credits({ force });
  const day = utcDay();
  if (c.day !== day) throw new Error('This device’s clock and the server disagree on today’s date in UTC. Fix the clock and try again.');
  const { workspaceKey } = store.get();
  const slot = freeSlot(id.secretScalar, workspaceKey, day, c.slots, c.spent);
  if (slot === null) throw new Error('You’ve used today’s AI requests. They renew at midnight UTC.');
  const { default: proveCredit } = await import('../lib/aiCredit/proveCredit');
  const proof = await proveCredit(id, c.members, c.depth, creditScope(workspaceKey, day, slot), creditMessage(feature, payload));
  await jitter();
  const out = await http.anonymous<T>(`/ai-credits/${feature}`, { day, slot, payload, proof });
  c.spent.push(proof.nullifier);
  return out;
}

// Sends built-in AI requests with no cookie and a proof that some member asked, spending one of
// today's slots. Who asked never leaves this browser.
const anonymousAi = {
  credits,

  // This browser's identity, if it can prove membership right now; otherwise null, with the
  // reason kept for the interface. A key that changed after a reset is offered to the server
  // first: it's registered if nothing holds the old one, or noted so requests go signed in.
  async identity(): Promise<Identity | null> {
    const [{ Identity }, keys] = await Promise.all([import('@semaphore-protocol/identity'), unlockPrivateKeys()]);
    const id = new Identity(keys.semaphoreSecret);
    const mine = id.commitment.toString();
    if (mine !== store.get().me?.semaphoreCommitment) await registerVotingKey(keys).catch(() => {});
    const changed = mine !== store.get().me?.semaphoreCommitment;
    // a cached list may predate your key; only then is a fresh one fetched
    const listed = !changed && ((await credits()).members.includes(mine) || (await credits({ force: true })).members.includes(mine));
    store.set({ aiSignedReason: changed ? KEY_CHANGED : listed ? null : NOT_LISTED });
    return listed ? id : null;
  },

  async send<T>(feature: string, body: object, id: Identity): Promise<T> {
    const payload = JSON.stringify(body);
    try {
      return await attempt<T>(feature, payload, id, false);
    } catch (err) {
      // the member list moved on, or another of your devices spent that slot: look again once
      if (err instanceof ApiError && err.status === 409) return attempt<T>(feature, payload, id, true);
      throw err;
    }
  },
};

export default anonymousAi;
