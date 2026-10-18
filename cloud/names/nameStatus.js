import nameCheck from './nameCheck.js';

const DAY = 86_400_000;

// Whether someone can sign up for this address right now.
export default function nameStatus(ctx, input) {
  const check = nameCheck(input, ctx.config.signup);
  if (!check.ok) return { available: false, name: check.name, reason: check.reason };
  const held = ctx.store.workspaces.nameStatus(check.name, ctx.store.now() - ctx.config.signup.quarantineDays * DAY);
  // a deleted team's address stays out of reach for a while, so links its members still have
  // can't be picked up by someone else
  if (held === 'live') return { available: false, name: check.name, reason: 'That address is taken.' };
  if (held === 'quarantined') return { available: false, name: check.name, reason: 'That address was in use recently. It becomes available again later.' };
  if (ctx.store.requests.byName(check.name)) return { available: false, name: check.name, reason: 'That address is taken.' };
  return { available: true, name: check.name };
}
