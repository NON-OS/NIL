import meta from './meta';
import dates from './dates';
import noxAmount from './noxAmount';
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
    case 'reminder':
      return 'reminder:';
    case 'proposal':
      return 'started a vote:';
    case 'bounty_paid':
      return `paid you ${noxAmount(String(n.data.amount))} for`;
    default:
      return 'updated';
  }
}
