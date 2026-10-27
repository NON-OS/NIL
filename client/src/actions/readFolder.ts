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
// see for the signer.
async function openName(key: Uint8Array, folder: EncryptedFolder) {
  const { signed, facts } = signedFacts.open(await folderName.open(key, folder.id, folder.version, folder.nameCt));
  if (!facts) return { name: signed.text, by: signed.by, facts: null, author: null };
  const f = folderFacts.parse(facts);
  const statement = { kind: folderFacts.kind, place: folderFacts.place(folder.id, folder.version), facts: folderFacts.list(f) };
  const fits = f.readers.includes(signed.by) && f.key === keyHash(key);
  const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)) : null;
  return { name: signed.text, by: signed.by, facts: f, author };
}

// A file's or subfolder's details check out when they open under its own key, name that key, its
// kind, the place the server shows it in and the blob it points at, and carry the signature of a
// teammate whose key this person can see. Anything else stays locked, nameless.
async function openItem(folderKey: Uint8Array, item: EncryptedItem) {
  const key = await itemKeyWrap.unwrap(folderKey, item.folderId, item.id, item.keyWrap);
  try {
    const { signed, facts } = signedFacts.open(await itemMeta.open(key, item.folderId, item.id, item.metaCt));
    const f = itemFacts.parse(facts ?? []);
    const sized = item.kind === 'folder' || item.blob?.size === blobCipher.sealedSize(f.size);
    const fits = sized && f.key === keyHash(key) && f.kind === item.kind && f.parent === item.parentId && f.blob === (item.blob?.id ?? null) && f.thumb === (item.thumb?.id ?? null);
    const statement = { kind: itemFacts.kind, place: itemFacts.place(item.folderId, item.id), facts: itemFacts.list(f) };
    const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)) : null;
    if (!author) throw new Error('unverified');
    return { signed, f, author };
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
    return {
      key,
      folder: {
        id: folder.id,
        name: folderLabel(v.name),
        version: folder.version,
        keyRev: folder.keyRev,
        audience: verified ? v.facts!.audience : folder.audience,
        readers: folder.readers,
        createdBy: folder.createdBy,
        updatedBy: verified ? v.by : folder.updatedBy,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        warning: !verified ? 'unverified' : folderVersions.folder(folder.id, folder.version) === 'rollback' ? 'rollback' : null,
        oldKey: v.author?.old ?? null,
        keyHash: keyHash(key),
      },
    };
  },

  decrypt: async (folder: EncryptedFolder) => (await readFolder.open(folder)).folder,

  // The folder key this tab opened the folder with, or null when it holds another.
  keyOf(folder: SharedFolder) {
    const key = folderKeys.get(folder.id);
    return key && keyHash(key) === folder.keyHash ? key : null;
  },

  async item(folderKey: Uint8Array, item: EncryptedItem): Promise<FolderItem> {
    const base = { id: item.id, folderId: item.folderId, parentId: item.parentId, kind: item.kind, keyWrap: item.keyWrap, blob: item.blob, thumb: item.thumb, createdBy: item.createdBy, createdAt: item.createdAt, updatedAt: item.updatedAt };
    try {
      const { signed, f, author } = await openItem(folderKey, item);
      const shown = item.kind === 'file' ? fileMeta(signed.text, f.type) : { name: folderLabel(signed.text), type: '' };
      const rollback = folderVersions.item(item.id, f.edit) === 'rollback';
      return { ...base, ...shown, size: f.size, width: f.width, height: f.height, hash: f.hash, edit: f.edit, by: signed.by, locked: false, rollback, oldKey: author.old };
    } catch {
      return { ...base, name: '', type: '', size: 0, width: null, height: null, hash: null, edit: 0, by: null, locked: true, rollback: false, oldKey: null };
    }
  },
};

export default readFolder;
