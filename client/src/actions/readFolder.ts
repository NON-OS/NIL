import store from '../state/store';
import keyring from '../state/keyring';
import folderKeys from '../state/folderKeys';
import folderVersions from '../state/folderVersions';
import folderKeySeal from '../lib/crypto/folderKeySeal';
import folderName from '../lib/crypto/folderName';
import folderFacts from '../lib/crypto/folderFacts';
import itemFacts from '../lib/crypto/itemFacts';
import itemKeyWrap from '../lib/crypto/itemKeyWrap';
import itemMeta from '../lib/crypto/itemMeta';
import signedFacts from '../lib/crypto/signedFacts';
import blobCipher from '../lib/crypto/blobCipher';
import keyHash from '../lib/crypto/keyHash';
import fileMeta from '../lib/fileMeta';
import folderLabel from '../lib/folderLabel';
import stripBidi from '../lib/stripBidi';
import isAdmin from '../lib/isAdmin';
import keyDirectory from './keyDirectory';
import type EncryptedFolder from '../types/EncryptedFolder';
import type EncryptedItem from '../types/EncryptedItem';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

function unwrap(folder: EncryptedFolder) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  return folderKeySeal.open(folder.wrappedKey, id.privateKey, id.publicKey);
}

// A folder's name checks out like a doc version: its signer is one of the readers it names, the
// key it opened with is the one signed, and the signature verifies against a key this person can
// see for the signer. On top, only its creator or an admin can sign who it's for and which of its
// keys this is, so another reader can't widen it to the team or pass an old key off as the newest.
async function openName(key: Uint8Array, folder: EncryptedFolder) {
  const { signed, facts } = signedFacts.open(await folderName.open(key, folder.id, folder.version, folder.nameCt));
  if (!facts) return { name: signed.text, by: signed.by, facts: null, author: null };
  const f = folderFacts.parse(facts);
  const manager = signed.by === folder.createdBy || isAdmin(store.get().users[signed.by]);
  const sameKey = f.version === 1 || f.keyRev === folder.keyRev;
  const fits = f.readers.includes(signed.by) && f.key === keyHash(key) && manager && sameKey;
  const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, folderFacts.statement(folder.id, folder.version, f), k)) : null;
  return { name: signed.text, by: signed.by, facts: f, author };
}

// A file's or subfolder's details check out when they open under its own key (and the folder key,
// in a folder whose details are bound to it), name that key, its kind, the place the server shows
// it in and the blobs it points at, and carry the signature of a teammate whose key this person
// can see. Details not bound to the folder key must also come from one of the folder's signed
// readers. Anything else stays locked, nameless.
async function openItem(folderKey: Uint8Array, folder: SharedFolder, item: EncryptedItem) {
  const key = await itemKeyWrap.unwrap(folderKey, item.folderId, item.id, item.keyWrap);
  try {
    const { payload, bound } = await itemMeta.open(key, folderKey, item.folderId, item.id, item.metaCt, { older: !folder.bound });
    const { signed, facts } = signedFacts.open(payload);
    const f = itemFacts.parse(facts ?? []);
    const sized = item.kind === 'folder' || item.blob?.size === blobCipher.sealedSize(f.size);
    const parts = f.blob === (item.blob?.id ?? null) && f.thumb === (item.thumb?.id ?? null) && f.hashes === (item.hashes?.id ?? null);
    const signer = bound || folder.signedReaders.includes(signed.by);
    const fits = sized && parts && signer && f.key === keyHash(key) && f.kind === item.kind && f.parent === item.parentId;
    const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, itemFacts.statement(item.folderId, item.id, f), k)) : null;
    if (!author) throw new Error('unverified');
    return { signed, f, author, bound };
  } finally {
    key.fill(0);
  }
}

// Decrypts shared folders and what's in them, and checks who wrote each name. A folder whose name
// doesn't check out still lists the files that do, but nothing is written or shared under its key.
const readFolder = {
  async open(folder: EncryptedFolder): Promise<{ folder: SharedFolder; key: Uint8Array }> {
    const cached = folderKeys.get(folder.id);
    let key = cached ?? (await unwrap(folder));
    let v;
    try {
      v = await openName(key, folder);
    } catch (err) {
      // the folder may have moved to a new key since this tab last opened it
      if (!cached) throw err;
      key = await unwrap(folder);
      v = await openName(key, folder);
    }
    folderKeys.remember(folder.id, key);
    const verified = Boolean(v.author && v.facts);
    const keyRev = v.facts?.version === 2 ? v.facts.keyRev! : null;
    const rolledBack = verified && (folderVersions.folder(folder.id, folder.version) === 'rollback' || (keyRev !== null && folderVersions.key(folder.id, keyRev) === 'rollback'));
    return {
      key,
      folder: {
        id: folder.id,
        name: folderLabel(v.name),
        version: folder.version,
        keyRev: folder.keyRev,
        resealRev: folder.resealRev,
        // the server's word alone never widens a folder to the team
        audience: verified ? v.facts!.audience : 'people',
        readers: folder.readers,
        signedReaders: verified ? v.facts!.readers : [],
        createdBy: folder.createdBy,
        updatedBy: verified ? v.by : folder.updatedBy,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        warning: !verified ? 'unverified' : rolledBack ? 'rollback' : null,
        oldKey: v.author?.old ?? null,
        keyHash: keyHash(key),
        bound: verified && Boolean(v.facts!.bound),
      },
    };
  },

  decrypt: async (folder: EncryptedFolder) => (await readFolder.open(folder)).folder,

  // The folder key this tab opened the folder with, or null when it holds another.
  keyOf(folder: SharedFolder) {
    const key = folderKeys.get(folder.id);
    return key && keyHash(key) === folder.keyHash ? key : null;
  },

  async item(folderKey: Uint8Array, folder: SharedFolder, item: EncryptedItem): Promise<FolderItem> {
    const base = {
      id: item.id,
      folderId: item.folderId,
      parentId: item.parentId,
      kind: item.kind,
      keyWrap: item.keyWrap,
      blob: item.blob,
      hashes: item.hashes,
      thumb: item.thumb,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      waiting: item.keyRev < folder.resealRev,
      deletedAt: item.deletedAt,
      deletedBy: item.deletedBy,
      trashRoot: item.trashRoot,
    };
    try {
      const { signed, f, author, bound } = await openItem(folderKey, folder, item);
      const shown = item.kind === 'file' ? fileMeta(stripBidi(signed.text), f.type) : { name: folderLabel(signed.text), type: '' };
      const rollback = folderVersions.item(item.id, f.edit) === 'rollback';
      return { ...base, ...shown, size: f.size, width: f.width, height: f.height, hash: f.hash, thumbHash: f.thumbHash, thumbSize: f.thumbSize, edit: f.edit, by: signed.by, locked: false, rollback, olderFormat: f.version === 1 || !bound, oldKey: author.old };
    } catch {
      return { ...base, name: '', type: '', size: 0, width: null, height: null, hash: null, thumbHash: null, thumbSize: null, edit: 0, by: null, locked: true, rollback: false, olderFormat: false, oldKey: null };
    }
  },
};

export default readFolder;
