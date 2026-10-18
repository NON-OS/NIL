import store from './store';

interface Scope {
  origin: string;
  workspaceKey: string;
  userId: string;
}

const current = (): Scope => {
  const s = store.get();
  return { origin: s.origin, workspaceKey: s.workspaceKey, userId: s.me?.id ?? '' };
};

const same = (a: Scope, b: Scope) => a.origin === b.origin && a.workspaceKey === b.workspaceKey && a.userId === b.userId;

// The site, workspace key and account this tab's keys were unlocked for. The server sends all
// three again with every bootstrap, and pins and revision records are filed under them. While the
// keys are unlocked the records stay filed under these. A bootstrap naming another site,
// workspace or account locks the keys, and the tab files nothing more until it reloads.
let bound: Scope | null = null;
// what the last bootstrap named, and whether one since sign-in named something else
let last: Scope | null = null;
let switched = false;

const keyScope = {
  // Records the scope as keys are unlocked. Refused once the tab has been switched, since an
  // unlock begun before the switch would otherwise finish under the new names.
  bind() {
    const scope = current();
    if (!scope.userId) throw new Error('Sign in before unlocking your keys.');
    if (switched) throw new Error('This tab was switched to another workspace or account, so Nil won’t unlock your keys in it. Reload the page and try again.');
    bound = scope;
  },

  release() {
    bound = null;
  },

  // Takes the scope a bootstrap names. True when it differs from the one the keys were unlocked
  // for, or from the one the previous bootstrap named; the tab then stays locked until it reloads.
  switches(next: Scope) {
    const before = bound ?? last;
    last = next;
    if (!before || same(before, next)) return false;
    switched = true;
    return true;
  },

  // After sign-out the next sign-in starts afresh.
  reset() {
    bound = null;
    last = null;
    switched = false;
  },

  // The local storage name for public key data of one kind, for this workspace and account. None
  // in a tab that was switched: nothing is read or written there until it reloads.
  slot(kind: string) {
    if (switched) return null;
    const s = bound ?? current();
    return `${kind}:${s.workspaceKey}:${s.userId}`;
  },
};

export default keyScope;
