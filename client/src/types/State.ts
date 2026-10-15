import type User from './User';
import type Workspace from './Workspace';
import type Project from './Project';
import type Label from './Label';
import type Goal from './Goal';
import type Task from './Task';
import type FocusItem from './FocusItem';
import type InboxItem from './InboxItem';
import type Activity from './Activity';
import type PresenceEntry from './PresenceEntry';
import type TaskDetail from './TaskDetail';
import type ToastMessage from './ToastMessage';
import type NoxInfo from './NoxInfo';
import type HolderGate from './HolderGate';
import type TimeEntry from './TimeEntry';

export default interface State {
  phase: 'loading' | 'auth' | 'ready';
  needsSetup: boolean;
  holderGate: HolderGate | null;
  me: User | null;
  workspace: Workspace;
  users: Record<string, User>;
  projects: Record<string, Project>;
  labels: Record<string, Label>;
  goals: Record<string, Goal>;
  tasks: Record<string, Task>;
  focus: FocusItem[];
  unread: number;
  inbox: InboxItem[] | null;
  feed: Activity[] | null;
  ai: boolean;
  nox: NoxInfo | null;
  proposalsRev: number;
  timer: TimeEntry | null;
  sourceUrl: string | null;
  presence: PresenceEntry[];
  // taskId -> userId -> when their "typing" hint expires
  typing: Record<string, Record<string, number>>;
  connected: boolean;
  detail: TaskDetail | null;
  quickAdd: { open: boolean; defaults?: Partial<Task> };
  palette: boolean;
  shortcuts: boolean;
  extract: boolean;
  sidebarOpen: boolean;
  toasts: ToastMessage[];
}
