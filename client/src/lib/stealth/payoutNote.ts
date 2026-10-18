import type PayeeStealth from '../../types/PayeeStealth';

// A line for the admin about to pay: why the payout can't be private, or that it's private
// thanks to the public registry. Nothing when private payouts are simply off for this person.
export default function payoutNote(name: string, stealth: PayeeStealth) {
  if (stealth.source === 'registry') return `${name}’s wallet has a meta-address in the public stealth registry, so this goes to a fresh one-time address only they can open.`;
  if (stealth.problem === 'none') return `${name} hasn’t turned on private payouts, and their wallet has no meta-address in the public stealth registry. So this can’t be paid privately: it goes to their wallet, where anyone can see it.`;
  if (stealth.problem === 'invalid') return `${name} hasn’t turned on private payouts, and what their wallet has in the public stealth registry isn’t a meta-address Nil can pay to. So this goes to their wallet, where anyone can see it.`;
  if (stealth.problem === 'unreadable') return `Nil couldn’t read the public stealth registry just now, so this would go to ${name}’s wallet. Try again in a minute to pay privately.`;
  return null;
}
