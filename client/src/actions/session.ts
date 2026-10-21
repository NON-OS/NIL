import http from '../api/http';
import revealTask from '../state/revealTask';
import keepWords from '../state/keepWords';
import openSealed from './openSealed';
import archive from './archive';
import checkBuild from './checkBuild';
import store from '../state/store';
import records from '../state/records';
import toast from '../state/toast';
import keyScope from '../state/keyScope';
import keyPins from '../state/keyPins';
import router from '../lib/router';
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
import type AiProviderSummary from '../types/AiProviderSummary';
import vault from './vault';
import offline from './offline';
import phoneConfig from '../lib/phone/phoneConfig';
import phoneWallet from '../lib/phone/phoneWallet';
import unreachable from '../lib/unreachable';

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
  aiProvider?: AiProviderSummary | null;
  aiAnonymous: boolean;
  nox: NoxInfo | null;
  rewards: RewardToken[];
  guest: boolean;
  sharing: SharingPolicy;
  plan: Plan;
  stealth: StealthInfo | null;
  privacyPools?: boolean;
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
// whether this sign-in has looked for pins that started over yet
let pinsChecked = false;

const NOTICE_MS = 30_000;
const SWITCHED = 'The server switched this tab to another workspace or account, so Nil locked your keys here. Reload the page to carry on. If nobody signed in as someone else in this browser, tell your workspace admin.';
const STARTED_OVER = 'This browser has teammates’ keys saved for another workspace or account, but none for this one. If you’ve used this account here before, the server may have switched workspaces. Compare fingerprints before you trust anyone’s key.';

async function load() {
  const b = await http.get<Bootstrap>('/bootstrap?tasks=cards');
  // keys unlocked for one site, workspace and account never carry on into another
  const switched = keyScope.switches({ origin: b.origin, workspaceKey: b.workspaceKey, userId: b.me?.id ?? '' });
  if (switched) {
    vault.lock();
    store.set((s) => ({ keysRev: s.keysRev + 1 }));
  }
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
    aiProvider: b.aiProvider ?? null,
    aiAnonymous: b.aiAnonymous,
    nox: b.nox,
    rewards: b.rewards ?? [],
    guest: b.guest,
    sharing: b.sharing,
    plan: b.plan,
    stealth: b.stealth,
    privacyPools: Boolean(b.privacyPools),
    timer: b.timer,
    sourceUrl: b.sourceUrl,
    origin: b.origin,
    workspaceKey: b.workspaceKey,
    passkeys: b.passkeys ?? [],
    recoveryKitAt: b.recoveryKitAt ?? null,
  });
  if (switched) toast.show(SWITCHED, { tone: 'error', timeout: NOTICE_MS, action: { label: 'Reload', run: () => location.reload() } });
  else if (!pinsChecked && keyPins.startedOver()) toast.show(STARTED_OVER, { tone: 'error', timeout: NOTICE_MS, action: { label: 'See keys', run: () => router.navigate('/settings?tab=security') } });
  pinsChecked = true;
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
  // the keys, and every private task, comment and file opened with them
  vault.lock();
  keyScope.reset();
  // a phone wallet goes with the sign-in: the phone is told, and its keys are forgotten here
  void phoneWallet.end();
  pinsChecked = false;
  // a count never used before, so the key directory isn't served from this account's pins
  store.reset({ phase: 'auth', keysRev: store.get().keysRev + 1 });
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
      const s = await http.get<{ needsSetup: boolean; user: User | null; workspace: Workspace | null; holderGate: HolderGate | null; walletConnect?: unknown }>('/auth/state');
      offline.answered();
      phoneConfig.set(s.walletConnect);
      void phoneWallet.restore();
      if (s.workspace) store.set({ workspace: s.workspace });
      if (s.user) await load();
      else store.set({ phase: 'auth', needsSetup: s.needsSetup, holderGate: s.holderGate });
    } catch (err) {
      // no answer at all means offline, not signed out: stay on this page and try again
      if (unreachable(err)) return offline.wait(() => void session.boot());
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
