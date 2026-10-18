import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import unlockPrivateKeys from './unlockPrivateKeys';
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

async function identity() {
  const [{ Identity }, keys] = await Promise.all([import('@semaphore-protocol/identity'), unlockPrivateKeys()]);
  const id = new Identity(keys.semaphoreSecret);
  if (id.commitment.toString() !== store.get().me?.semaphoreCommitment) {
    throw new Error('Your voting key changed when your keys were reset, so AI requests can’t be sent anonymously yet. Nil registers the new key once the anonymous votes you joined with the old one have closed.');
  }
  return id;
}

// a short random pause, so the request doesn't arrive in step with the page's signed-in ones
const jitter = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 1200));

async function attempt<T>(feature: string, payload: string, id: Identity, force: boolean) {
  const c = await credits({ force });
  const day = utcDay();
  if (c.day !== day) throw new Error('This device’s clock and the server disagree on today’s date in UTC. Fix the clock and try again.');
  if (!c.members.includes(id.commitment.toString())) throw new Error('Your voting key isn’t on the member list yet. Reload and try again.');
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

// Sends one built-in AI request with no cookie and a proof that some member asked, spending one
// of today's slots. Who asked never leaves this browser.
const anonymousAi = {
  credits,

  async send<T>(feature: string, body: object): Promise<T> {
    const id = await identity();
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
