import { BadgeCheck, BarChart3, CalendarDays, Coins, FileText, Home, Inbox, Kanban, List, MessagesSquare, Target, Timer, Vote } from 'lucide-react';

// The main sections, in order. Their position doubles as the small mono number in each
// page header, the brand's numbered-section style; `key` is the G-then-key shortcut.
// `members` marks sections guests don't get, since they only see their shared projects.
const navItems = [
  { to: '/', label: 'My work', icon: Home, key: 'h' },
  { to: '/inbox', label: 'Inbox', icon: Inbox, key: 'i' },
  { to: '/chat', label: 'Chat', icon: MessagesSquare, key: 'k', members: true },
  { to: '/board', label: 'Board', icon: Kanban, key: 'b' },
  { to: '/list', label: 'All tasks', icon: List, key: 'l' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, key: 'c' },
  { to: '/docs', label: 'Docs', icon: FileText, key: 'd', members: true },
  { to: '/goals', label: 'Goals', icon: Target, key: 'g', members: true },
  { to: '/insights', label: 'Insights', icon: BarChart3, key: 's' },
  { to: '/time', label: 'Time', icon: Timer, key: 'm' },
  { to: '/bounties', label: 'Bounties', icon: Coins, key: 'n' },
  { to: '/votes', label: 'Votes', icon: Vote, key: 'v', members: true },
  { to: '/proofs', label: 'Proof of work', icon: BadgeCheck, key: 'p' },
];

export default navItems;
