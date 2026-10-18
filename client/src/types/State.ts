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
import type DeckScope from './DeckScope';
import type RewardToken from './RewardToken';
import type SharingPolicy from './SharingPolicy';
import type Plan from './Plan';
import type StealthInfo from './StealthInfo';
import type TaskArchive from './TaskArchive';
import type FirstRun from './FirstRun';
import type AgentActivity from './AgentActivity';

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
  archive: TaskArchive;
  focus: FocusItem[];
  unread: number;
  inbox: InboxItem[] | null;
  feed: Activity[] | null;
  ai: boolean;
  // members with a voting key send built-in AI requests anonymously while this is on
  aiAnonymous: boolean;
  // why this browser sends AI requests signed in although you have a voting key, or null
  aiSignedReason: string | null;
  nox: NoxInfo | null;
  rewards: RewardToken[];
  // true when you're a guest who can see only the projects shared with you
  guest: boolean;
  sharing: SharingPolicy;
  plan: Plan;
  stealth: StealthInfo | null;
  // the getting-started card; null until My work asks for it
  firstRun: FirstRun | null;
  proposalsRev: number;
  timer: TimeEntry | null;
  docsUnlocked: boolean;
  docsRev: number;
  // the site and workspace key every key message is bound to (from bootstrap, set by APP_URL)
  origin: string;
  workspaceKey: string;
  // bumped when anyone publishes keys or this browser confirms one
  keysRev: number;
  // teammates whose new or changed keys are waiting for this person to confirm them
  keyCheck: { userIds: string[]; reason: string } | null;
  deck: { open: boolean; preset?: Partial<DeckScope> };
  sourceUrl: string | null;
  presence: PresenceEntry[];
  // taskId -> userId -> when their "typing" hint expires
  typing: Record<string, Record<string, number>>;
  connected: boolean;
  // a newer version of the web app has been deployed since this tab loaded
  updateReady: boolean;
  detail: TaskDetail | null;
  // agent runs and approval cards on the task open in the panel
  agentActivity: AgentActivity | null;
  quickAdd: { open: boolean; defaults?: Partial<Task> };
  palette: boolean;
  shortcuts: boolean;
  extract: boolean;
  sidebarOpen: boolean;
  toasts: ToastMessage[];
}
