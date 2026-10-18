import dates from './dates';
import type InboxItem from '../types/InboxItem';

const day = (ms: number) => dates.short(dates.toISO(new Date(ms)));

// Notifications that come from Nil itself rather than from a person, as a heading and one line.
// Null for everything else.
export default function systemNotice(n: InboxItem): { heading: string; text: string } | null {
  if (n.type === 'reminder') return { heading: 'Reminder', text: '' };
  if (n.type === 'due_soon') return { heading: 'Due soon', text: '' };
  if (n.type === 'due_today') return { heading: 'Due today', text: '' };
  if (n.type === 'plan_ending') {
    const when = n.data.days === 1 ? 'tomorrow' : `in ${n.data.days} days`;
    return { heading: 'Nil Pro', text: `${n.data.trial ? 'The trial' : 'Nil Pro'} runs out ${when}, on ${day(n.data.until)}. Paid tools keep working until ${day(n.data.lockAt)}. Renew in Settings → Plan.` };
  }
  // the server writes the whole line: what is stuck and what Nil does about it
  if (n.type === 'billing_stalled') return { heading: 'Payments', text: String(n.data.text ?? '') };
  if (n.type === 'holder_low') {
    return { heading: 'Holder door', text: `Your linked wallets now hold ${n.data.text}, counting NOX held, staked and Zero-State Passes. Hold enough again by ${day(n.data.until)} to keep signing in.` };
  }
  return null;
}
