import http from '../api/http';
import revealTask from '../state/revealTask';
import keepWords from '../state/keepWords';
import openSealed from './openSealed';
import archive from './archive';
import checkBuild from './checkBuild';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import socket from '../realtime/socket';
import type User from '../types/User';
import type Workspace from '../types/Workspace';
import type Project from '../types/Project';
import type Label from '../types/Label';
import type Goal from '../types/Goal';
import type Task from '../types/Task';
import type FocusItem from '../types/FocusItem';
import type NoxInfo from '../types/NoxInfo';
import type HolderGate from '../types/HolderGate';
import type TimeEntry from '../types/TimeEntry';
import type RewardToken from '../types/RewardToken';
import type SharingPolicy from '../types/SharingPolicy';
import type Plan from '../types/Plan';
import type StealthInfo from '../types/StealthInfo';
import type TaskArchive from '../types/TaskArchive';
import type Passkey from '../types/Passkey';
import privateKeys from '../state/privateKeys';
import keyring from '../state/keyring';

interface Bootstrap {
  me: User;
  workspace: Workspace;
  users: User[];
  projects: Project[];
  labels: Label[];
  goals: Goal[];
  tasks: Task[];
  archive: TaskArchive;
  focus: FocusItem[];
  unread: number;
  ai: boolean;
  nox: NoxInfo | null;
  rewards: RewardToken[];
  guest: boolean;
  sharing: SharingPolicy;
  plan: Plan;
  stealth: StealthInfo | null;
  timer: TimeEntry | null;
  sourceUrl: string | null;
  build: string | null;
  origin: string;
  workspaceKey: string;
  passkeys: Passkey[];
  recoveryKitAt: number | null;
}

// Re-bootstrapping after a reconnect is spread over this long, so a server that just restarted
// isn't asked by every open tab in the same second.
const RESYNC_SPREAD_MS = 8000;
let resync: number | undefined;

async function load() {
  const b = await http.get<Bootstrap>('/bootstrap?tasks=cards');
  const held = store.get().tasks;
  archive.reset();
  store.set({
    phase: 'ready',
    me: b.me,
    workspace: b.workspace,
    users: records.fromList(b.users),
    projects: records.fromList(b.projects),
    labels: records.fromList(b.labels),
    goals: records.fromList(b.goals),
    tasks: records.fromList(b.tasks.map((task) => keepWords(held[task.id], revealTask(task)))),
    archive: b.archive,
    focus: b.focus,
    unread: b.unread,
    ai: b.ai,
    nox: b.nox,
    rewards: b.rewards ?? [],
    guest: b.guest,
    sharing: b.sharing,
    plan: b.plan,
    stealth: b.stealth,
    timer: b.timer,
    sourceUrl: b.sourceUrl,
    origin: b.origin,
    workspaceKey: b.workspaceKey,
    passkeys: b.passkeys ?? [],
    recoveryKitAt: b.recoveryKitAt ?? null,
  });
  checkBuild(b.build);
  void openSealed();
  socket.connect(() => {
    // anything that happened while we were offline is picked up by a fresh bootstrap
    clearTimeout(resync);
    resync = window.setTimeout(() => load().catch(() => {}), Math.random() * RESYNC_SPREAD_MS);
  });
}

function signedOut(message?: string) {
  clearTimeout(resync);
  socket.disconnect();
  keyring.lock();
  privateKeys.lock();
  store.reset({ phase: 'auth' });
  history.replaceState(null, '', '/');
  if (message) toast.show(message, { tone: 'error' });
}

http.onSessionEnded(() => {
  if (store.get().phase === 'ready') signedOut('Your session ended. Sign in again.');
});

const session = {
  enter: load,

  async boot() {
    try {
      const s = await http.get<{ needsSetup: boolean; user: User | null; workspace: Workspace | null; holderGate: HolderGate | null }>('/auth/state');
      if (s.workspace) store.set({ workspace: s.workspace });
      if (s.user) await load();
      else store.set({ phase: 'auth', needsSetup: s.needsSetup, holderGate: s.holderGate });
    } catch (err) {
      store.set({ phase: 'auth' });
      toast.error(err);
    }
  },

  async logout() {
    try {
      await http.post('/auth/logout');
    } finally {
      signedOut();
    }
  },

  async signOutEverywhere(keys = false) {
    try {
      await http.post('/me/sign-out-everywhere', { keys });
    } finally {
      signedOut(keys ? 'Signed out on every device, and your access keys were revoked.' : 'Signed out on every device.');
    }
  },
};

export default session;
