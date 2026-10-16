import type InboxItem from '../types/InboxItem';

// The heading of a notice that comes from Nil itself rather than from a person, or null.
export default function noticeLead(n: Pick<InboxItem, 'type'>): string | null {
  switch (n.type) {
    case 'reminder':
      return 'Reminder';
    case 'due_soon':
      return 'Due soon';
    case 'due_today':
      return 'Due today';
    default:
      return null;
  }
}
