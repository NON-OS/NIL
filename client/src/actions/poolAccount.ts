import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import keyring from '../state/keyring';
import poolKey from '../state/poolKey';
import noteBook from '../lib/pools/noteBook';
import vault from './vault';
import keyDirectory from './keyDirectory';
import type PoolAccount from '../types/PoolAccount';
import type PoolBook from '../types/PoolBook';
import type PoolInfo from '../types/PoolInfo';

const kit = async () => (await import('../lib/pools/poolKit')).default;

export type PoolState = { state: 'none' } | { state: 'waiting'; holders: string[] } | { state: 'open'; book: PoolBook; rev: number; startBlock: number };

let current: { book: PoolBook; rev: number; startBlock: number } | null = null;

async function identity() {
  await vault.unlock();
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your encryption keys first.');
  return id;
}

// Hands the pool key to every other admin whose key this person confirmed and who doesn't hold
// it yet. Admins whose keys aren't confirmed here get it from someone who has confirmed them.
async function share(key: Uint8Array, account: PoolAccount) {
  const { users, me } = store.get();
  const admins = Object.values(users).filter((u) => (u.role === 'owner' || u.role === 'admin') && u.kind === 'human' && !u.deactivated && u.id !== me?.id && !account.holders?.includes(u.id));
  if (!admins.length) return;
  const { poolKeySeal } = await kit();
  const keys = await keyDirectory.sharable(admins.map((u) => u.id));
  const grants = await Promise.all([...keys].map(async ([userId, publicKey]) => ({ userId, wrapped: await poolKeySeal.seal(key, publicKey) })));
  if (grants.length) await http.put('/pool-account/keys', { grants }).catch(() => {});
}

async function opened(account: PoolAccount): Promise<PoolState> {
  if (!account.exists) return { state: 'none' };
  if (!account.wrapped) return { state: 'waiting', holders: account.holders ?? [] };
  const id = await identity();
  const { poolKeySeal, noteSeal } = await kit();
  let key = poolKey.get();
  if (!key) {
    key = await poolKeySeal.open(account.wrapped, id.privateKey, id.publicKey).catch(() => {
      throw new Error('The pool key sealed to you doesn’t open with your current keys. Ask another admin who holds it to open the pool, which seals it to you again.');
    });
    poolKey.set(key, id);
  }
  if (noteSeal.tag(key) !== account.keyTag) throw new Error('The pool key you hold isn’t the team’s current one. Ask another admin to open the pool.');
  current = { book: await noteSeal.open(key, account.notes!), rev: account.notesRev!, startBlock: account.startBlock! };
  void share(key, account);
  return { state: 'open', ...current };
}

// The team's pool account: one key every admin holds, sealed to each of them, and the notes it
// encrypts. Every change to the notes is saved over the revision it started from; if another
// admin saved first, the change is made again on top of theirs.
const poolAccount = {
  info: () => http.get<PoolInfo>('/pools'),

  open: async () => opened((await http.get<{ account: PoolAccount }>('/pool-account')).account),

  // A new account, from fresh random bytes or from a recovery phrase the team kept.
  async create(phrase?: string) {
    const id = await identity();
    const { poolKeySeal, noteSeal, poolPhrase } = await kit();
    const key = phrase ? poolPhrase.toKey(phrase) : crypto.getRandomValues(new Uint8Array(16));
    const body = { keyTag: noteSeal.tag(key), wrapped: await poolKeySeal.seal(key, id.publicKey), notes: await noteSeal.seal(key, noteBook.empty()) };
    poolKey.set(key, id);
    return opened((await http.post<{ account: PoolAccount }>('/pool-account', body)).account);
  },

  book: () => current?.book ?? null,

  async update(change: (book: PoolBook) => PoolBook): Promise<PoolBook> {
    const key = poolKey.get();
    if (!key || !current) throw new Error('Open the team’s pool first.');
    const { noteSeal } = await kit();
    let base = current;
    let next = change(base.book);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { account } = await http.put<{ account: PoolAccount }>('/pool-account/notes', { notes: await noteSeal.seal(key, next), rev: base.rev });
        current = { book: next, rev: account.notesRev!, startBlock: base.startBlock };
        return next;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
        const { account } = await http.get<{ account: PoolAccount }>('/pool-account');
        base = { book: await noteSeal.open(key, account.notes!), rev: account.notesRev!, startBlock: base.startBlock };
        next = change(base.book);
      }
    }
    throw new Error('Other admins keep changing the pool notes. Reload and try again.');
  },

  // Drops the team's account so it can start over with a new key. The browser offers it only
  // once nothing is left in the pool.
  async remove() {
    await http.del('/pool-account');
    poolKey.forget();
    current = null;
    return { state: 'none' } as PoolState;
  },

  // The phrase, for keeping somewhere safe or for opening the pool in the Privacy Pools app.
  async phrase() {
    const key = poolKey.get();
    if (!key) throw new Error('Open the team’s pool first.');
    return (await kit()).poolPhrase.fromKey(key);
  },
};

export default poolAccount;
