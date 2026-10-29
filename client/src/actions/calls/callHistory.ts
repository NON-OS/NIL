import { utf8ToBytes } from '@noble/hashes/utils';
import sealedLocal from '../../lib/sealedLocal/sealedLocal';
import keyring from '../../state/keyring';
import store from '../../state/store';
import type CallView from '../../types/CallView';

export interface CallRecord {
  id: string;
  kind: CallView['kind'];
  projectId: string | null;
  // everyone else who was in the call, or who rang or was rung
  people: string[];
  at: number;
  seconds: number;
  video: boolean;
  // you started it, you answered it, it rang and nobody here answered, or you declined it
  way: 'out' | 'in' | 'missed' | 'declined';
}

// how many calls this browser remembers
const KEEP = 60;
const USE = 'call-history';
const NAME = 'recent';

let cache: CallRecord[] | null = null;
// whose list the cache holds, so another account in this tab never sees it
let cacheFor: string | null = null;
// rings already written down, so one declined here isn't also missed when its ring ends
const handled = new Set<string>();
let writing: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
// the call this tab is in now, until it ends
let current: { record: CallRecord; joined: number } | null = null;

async function load(): Promise<CallRecord[]> {
  const me = store.get().me?.id ?? null;
  if (cache && cacheFor === me) return cache;
  cacheFor = me;
  const bytes = await sealedLocal.get(USE, NAME);
  try {
    const list = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as CallRecord[]) : [];
    cache = Array.isArray(list) ? list : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(record: CallRecord) {
  writing = writing.then(async () => {
    const list = [record, ...(await load()).filter((r) => r.id !== record.id || r.way !== record.way)].slice(0, KEEP);
    cache = list;
    await sealedLocal.put(USE, NAME, utf8ToBytes(JSON.stringify(list)));
    listeners.forEach((fn) => fn());
  });
}

const blank = (view: CallView, way: CallRecord['way'], video: boolean): CallRecord => ({ id: view.id, kind: view.kind, projectId: view.projectId, people: [], at: Date.now(), seconds: 0, video, way });

const others = (ids: string[]) => ids.filter((id) => id !== store.get().me?.id);

// The calls this person made, took and missed, kept only in this browser and only as
// ciphertext (sealedLocal), so the server, which keeps no history of calls, never learns it.
// While the keys are locked there's nothing to show.
const callHistory = {
  async list() {
    return keyring.identity() ? load() : null;
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  // this tab joined a call
  began(view: CallView, video: boolean) {
    const me = store.get().me?.id;
    current = { record: blank(view, view.startedBy === me ? 'out' : 'in', video), joined: Date.now() };
    callHistory.saw(view);
  },

  // who is in the call now, or being rung
  saw(view: CallView) {
    if (current?.record.id !== view.id) return;
    const people = new Set([...current.record.people, ...others([...view.members.map((m) => m.userId), ...view.ringing, view.startedBy])]);
    current.record.people = [...people];
  },

  camera(on: boolean) {
    if (current && on) current.record.video = true;
  },

  // the call this tab was in is over for it; one it never got into isn't kept
  ended(wasIn: boolean) {
    if (!current) return;
    if (wasIn) save({ ...current.record, seconds: Math.round((Date.now() - current.joined) / 1000) });
    current = null;
  },

  // a call that rang here and stopped: declined from this tab, or missed
  rang(view: CallView, way: 'missed' | 'declined') {
    if (handled.has(view.id)) return;
    handled.add(view.id);
    save({ ...blank(view, way, false), at: view.startedAt, people: others([view.startedBy, ...view.members.map((m) => m.userId), ...view.ringing]) });
  },

  async clear() {
    writing = writing.then(async () => {
      cache = [];
      await sealedLocal.remove(USE, NAME);
      listeners.forEach((fn) => fn());
    });
    await writing;
  },
};

export default callHistory;
