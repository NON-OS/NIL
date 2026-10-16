import meta from './meta';
import dates from './dates';
import tokenAmount from './tokenAmount';
import type InboxItem from '../types/InboxItem';

// The verb phrase after the actor's name: "assigned you", "moved it to Done".
export default function describeNotification(n: InboxItem) {
  switch (n.type) {
    case 'assigned':
      return 'assigned you';
    case 'mention':
      return 'mentioned you on';
    case 'comment':
      return 'commented on';
    case 'status':
      return `moved to ${meta.status[n.data.to as keyof typeof meta.status] ?? n.data.to}`;
    case 'due':
      return n.data.to ? `set the due date to ${dates.short(n.data.to)} on` : 'removed the due date on';
    case 'application':
      return 'applied for your public bounty';
    case 'reminder':
      return 'reminder:';
    case 'proposal':
      return 'started a vote:';
    case 'bounty_paid':
      return `paid you ${tokenAmount(String(n.data.amount), n.data.token)} for`;
    case 'agent_approval':
      return `asks for approval: ${n.data.summary ?? 'a change'}${n.data.title ? ' on' : ''}`;
    case 'agent_webhook_off':
      return 'stopped receiving events: its webhook kept failing and was switched off.';
    default:
      return 'updated';
  }
}
