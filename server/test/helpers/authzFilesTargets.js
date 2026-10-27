import crypto from 'node:crypto';
import sealedBlob from './sealedBlob.js';
import sharedFolder from './sharedFolder.js';

// The matrix's targets for encrypted files: a team folder and a subfolder in it, a finished blob
// in the matrix's doc, and makers for fresh ones. Members, admins and the owner hold keys to the
// doc and the folder; the member made both.
export default async function authzFilesTargets(world, t) {
  const { people, ids } = world;
  const { member } = people;
  const readers = ['member', 'admin', 'owner'].map((who) => ids[who]);
  const docScope = { kind: 'doc', id: t.doc };
  const newFolder = async () => (await sharedFolder.create(member, readers, { audience: 'team' })).id;
  const newItem = async () => (await sharedFolder.add(member, { id: t.folder, keyRev: 1 }, { kind: 'folder' })).data.item.id;

  t.folder = await newFolder();
  t.folderItem = await newItem();
  t.blob = (await sealedBlob.upload(member, docScope)).id;
  // a folder someone was taken out of, whose items wait to be encrypted again
  const { default: sql } = await import('../../db/sql.js');
  t.resealFolder = await newFolder();
  sql.run('UPDATE folders SET reseal_rev = key_rev WHERE id = ?', t.resealFolder);

  const fresh = {
    folder: newFolder,
    folderItem: newItem,
    blob: async () => (await sealedBlob.upload(member, docScope)).id,
    // a subfolder in the member's folder, and one already in its trash
    trashedItem: async () => {
      const id = await newItem();
      await member('DELETE', `/api/folders/${t.folder}/items/${id}`);
      return id;
    },
    waitingItem: async () => {
      const id = (await sharedFolder.add(member, { id: t.resealFolder, keyRev: 1 }, { kind: 'folder' })).data.item.id;
      sql.run('UPDATE folder_items SET key_rev = 0 WHERE id = ?', id);
      return id;
    },
    // a doc's file waiting to be encrypted again, and the member's fresh copy of it
    docCopy: async () => {
      const { id: old } = await sealedBlob.upload(member, docScope);
      sql.run('UPDATE sealed_blobs SET reseal = 1 WHERE id = ?', old);
      return (await sealedBlob.upload(member, docScope, 100, { replaces: old })).id;
    },
  };
  // the caller's own uploads, started and, for finishing, with their one chunk in
  const own = {
    blob: async (who) => (await sealedBlob.start(people[who], docScope, 10)).data.blob,
    filledBlob: async (who) => {
      const id = (await sealedBlob.start(people[who], docScope, 10)).data.blob;
      await sealedBlob.put(people[who], id, 0, crypto.randomBytes(26));
      return id;
    },
  };
  return { fresh, own };
}
