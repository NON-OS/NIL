import http from '../api/http';
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
import keyring from '../state/keyring';

interface Bootstrap {
  me: User;
  workspace: Workspace;
  users: User[];
  projects: Project[];
  labels: Label[];
  goals: Goal[];
  tasks: Task[];
  focus: FocusItem[];
  unread: number;
  ai: boolean;
  nox: NoxInfo | null;
  timer: TimeEntry | null;
  sourceUrl: string | null;
}

async function load() {
  const b = await http.get<Bootstrap>('/bootstrap');
  store.set({
    phase: 'ready',
    me: b.me,
    workspace: b.workspace,
    users: records.fromList(b.users),
    projects: records.fromList(b.projects),
    labels: records.fromList(b.labels),
    goals: records.fromList(b.goals),
    tasks: records.fromList(b.tasks),
    focus: b.focus,
    unread: b.unread,
    ai: b.ai,
    nox: b.nox,
    timer: b.timer,
    sourceUrl: b.sourceUrl,
  });
  socket.connect(() => load().catch(() => {}));
}

function signedOut(message?: string) {
  socket.disconnect();
  keyring.lock();
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

  async signOutEverywhere() {
    try {
      await http.post('/me/sign-out-everywhere');
    } finally {
      signedOut('Signed out on every device.');
    }
  },
};

export default session;
