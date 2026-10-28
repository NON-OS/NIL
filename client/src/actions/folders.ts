import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import folderKeys from '../state/folderKeys';
import folderKeySeal from '../lib/crypto/folderKeySeal';
import folderName from '../lib/crypto/folderName';
import folderFacts from '../lib/crypto/folderFacts';
import itemKeyWrap from '../lib/crypto/itemKeyWrap';
import itemMeta from '../lib/crypto/itemMeta';
import signedFacts from '../lib/crypto/signedFacts';
import keyHash from '../lib/crypto/keyHash';
import b64u from '../lib/crypto/b64u';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
import readFolder from './readFolder';
import type EncryptedFolder from '../types/EncryptedFolder';
import type EncryptedItem from '../types/EncryptedItem';
import type FilesOverview from '../types/FilesOverview';
import type SharedFolder from '../types/SharedFolder';

type Audience = SharedFolder['audience'];
type Listing = { folder: EncryptedFolder; items: EncryptedItem[] };

function identity() {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  return id;
}

// This person's own copy goes to their unlocked key directly; everyone else's to a confirmed key,
// exactly as for docs.
async function sealFor(folderKey: Uint8Array, userIds: string[]) {
  const me = store.get().me!.id;
  const keys = await keyDirectory.sharable(userIds.filter((id) => id !== me));
  const grants: { userId: string; wrappedKey: string }[] = [];
  if (userIds.includes(me)) grants.push({ userId: me, wrappedKey: await folderKeySeal.seal(folderKey, identity().publicKey) });
  for (const [userId, publicKey] of keys) grants.push({ userId, wrappedKey: await folderKeySeal.seal(folderKey, publicKey) });
  return grants;
}

// The name, signed for this folder and version together with who it's for, which key protects
// it, which of the folder's keys that is, and whether every item's details are bound to it, then
// encrypted with the version in the additional data.
function sealedName(folderKey: Uint8Array, folderId: string, version: number, name: string, to: { audience: Audience; readers: (string | null)[]; keyRev: number; bound: boolean }) {
  const by = store.get().me!.id;
  const facts = folderFacts.list({ audience: to.audience, readers: folderFacts.readers([by, ...to.readers]), key: keyHash(folderKey), at: Date.now(), keyRev: to.keyRev, bound: to.bound });
  return folderName.seal(folderKey, folderId, version, signedFacts.seal(name, { kind: folderFacts.kind, place: folderFacts.place(folderId, version), facts, by, signingPrivate: identity().signingPrivate }));
}

// Anything written to a folder, or shared from it, uses the very key its name checked out with,
// and never one older than this browser has already seen for it.
function writable(folder: SharedFolder, what: string) {
  if (folder.warning === 'unverified') throw new Error(`Nil can’t confirm the folder’s creator or an admin named this folder, so it won’t ${what} under its key. Its creator or an admin can give it a new key under Who can open this.`);
  if (folder.warning === 'rollback') throw new Error(`The server is showing an older version of this folder than you’ve already opened, so Nil won’t ${what} under its key.`);
  const key = readFolder.keyOf(folder);
  if (!key) throw new Error(`Open the folder again to ${what}.`);
  return key;
}

// guests don't get team folders
const people = () => Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent' && u.role !== 'guest').map((u) => u.id);

// Whether an item sits somewhere under one of `dropped`.
function insideDropped(items: EncryptedItem[], id: string, dropped: Set<string>) {
  const parents = new Map(items.map((i) => [i.id, i.parentId]));
  for (let at = parents.get(id) ?? null, steps = 0; at && steps < items.length; at = parents.get(at) ?? null, steps++) if (dropped.has(at)) return true;
  return false;
}

const folders = {
  writable,

  async list(): Promise<FilesOverview> {
    const res = await http.get<{ folders: EncryptedFolder[]; waiting: FilesOverview['waiting']; usage: FilesOverview['usage'] }>('/folders');
    const opened = await Promise.all(res.folders.map((f) => readFolder.decrypt(f).catch(() => null)));
    return { folders: opened.filter((f): f is SharedFolder => f !== null), waiting: res.waiting, usage: res.usage };
  },

  // A folder with everything in it, decrypted and checked, and what's in its trash apart. `id`
  // may be a subfolder's.
  async open(id: string) {
    const res = await http.get<Listing>(`/folders/${encodeURIComponent(id)}`);
    const { folder, key } = await readFolder.open(res.folder);
    const all = await Promise.all(res.items.map((item) => readFolder.item(key, folder, item)));
    return { folder, items: all.filter((i) => i.deletedAt === null), trash: all.filter((i) => i.deletedAt !== null) };
  },

  async create({ name, audience, people: picked = [] }: { name: string; audience: Audience; people?: string[] }) {
    const me = store.get().me!;
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    if (audience === 'people') await confirmKeys.ask(picked, 'this folder');
    const grants = await sealFor(key, [me.id, ...(audience === 'team' ? people() : picked)]);
    const nameCt = await sealedName(key, id, 1, name, { audience, readers: grants.map((g) => g.userId), keyRev: 1, bound: true });
    const res = await http.post<{ folder: EncryptedFolder }>('/folders', { id, audience, grants, nameCt });
    folderKeys.remember(id, key);
    return readFolder.decrypt(res.folder);
  },

  async rename(folder: SharedFolder, name: string) {
    const key = writable(folder, 'rename it');
    const nameCt = await sealedName(key, folder.id, folder.version + 1, name, { audience: folder.audience, readers: folder.readers, keyRev: folder.keyRev, bound: folder.bound });
    return readFolder.decrypt((await http.put<{ folder: EncryptedFolder }>(`/folders/${folder.id}`, { baseVersion: folder.version, nameCt })).folder);
  },

  async share(folder: SharedFolder, userIds: string[]) {
    const key = writable(folder, 'share it');
    const adding = userIds.filter((u) => !folder.readers.includes(u));
    await confirmKeys.ask(adding, 'this folder');
    const grants = await sealFor(key, adding);
    if (!grants.length) return folder.readers;
    return (await http.post<{ readers: string[] }>(`/folders/${folder.id}/grants`, { grants })).readers;
  },

  // Taking someone out gives the folder a new key, sealed for whoever stays. Every file's and
  // subfolder's own key is wrapped under it, and its details encrypted again under it, so a copy of
  // the old folder key opens nothing from now on and nobody without the new one can write details
  // anyone accepts. Items nobody can open here are dropped rather than blocking the change; how
  // many is returned. The files themselves are then encrypted again under fresh keys by the
  // browsers of the people who stay (see folderReseal). Re-keying also signs the name as yours,
  // which is how a folder whose name didn't check out gets a clean key.
  async restrict(folder: SharedFolder, keep: string[], audience: Audience) {
    const me = store.get().me!;
    await confirmKeys.ask(keep, 'this folder');
    const now = await http.get<Listing>(`/folders/${folder.id}`);
    const { key: old, folder: opened } = await readFolder.open(now.folder);
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    const drop: string[] = [];
    const items: { id: string; keyWrap: string; metaCt: string }[] = [];
    for (const item of now.items) {
      const itemKey = await itemKeyWrap.unwrap(old, folder.id, item.id, item.keyWrap).catch(() => null);
      const meta = itemKey && (await itemMeta.open(itemKey, old, folder.id, item.id, item.metaCt, { older: !opened.bound }).catch(() => null));
      if (!itemKey || !meta) {
        itemKey?.fill(0);
        drop.push(item.id);
        continue;
      }
      try {
        items.push({ id: item.id, keyWrap: await itemKeyWrap.wrap(fresh, folder.id, item.id, itemKey), metaCt: await itemMeta.seal(itemKey, fresh, folder.id, item.id, meta.payload) });
      } finally {
        itemKey.fill(0);
      }
    }
    const grants = await sealFor(fresh, [me.id, ...keep]);
    const nameCt = await sealedName(fresh, folder.id, now.folder.version + 1, folder.name, { audience, readers: grants.map((g) => g.userId), keyRev: now.folder.keyRev + 1, bound: true });
    // an item inside one that's dropped goes with it, so the server doesn't need its details
    const kept = items.filter((i) => !insideDropped(now.items, i.id, new Set(drop)));
    const res = await http.post<{ readers: string[] }>(`/folders/${folder.id}/rotate`, { baseVersion: now.folder.version, audience, grants, nameCt, items: kept, drop });
    folderKeys.remember(folder.id, fresh);
    return { readers: res.readers, dropped: drop.length };
  },

  // Hands team folders to teammates who joined or unlocked later, once this person has confirmed
  // their keys. Only a name signed as the team's counts, whatever the server lists.
  async shareWithTeam(list: SharedFolder[]) {
    const everyone = people();
    const ready = new Set((await keyDirectory.sharable(everyone)).keys());
    for (const folder of list.filter((f) => f.audience === 'team' && !f.warning)) {
      const missing = everyone.filter((u) => ready.has(u) && !folder.readers.includes(u));
      const key = readFolder.keyOf(folder);
      if (!missing.length || !key) continue;
      const grants = await sealFor(key, missing);
      if (grants.length) await http.post(`/folders/${folder.id}/grants`, { grants }).catch(() => {});
    }
  },

  async remove(folder: SharedFolder) {
    await http.del(`/folders/${folder.id}`);
    folderKeys.forget(folder.id);
  },
};

export default folders;
