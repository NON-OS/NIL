import actors from './authzActors.js';
import cipher from './cipher.js';
import sealedBlob from './sealedBlob.js';
import sharedFolder from './sharedFolder.js';

const { MEMBERS } = actors;
const CHUNK = { raw: 'x'.repeat(26), headers: { 'Content-Type': 'application/octet-stream' }, index: () => '0' };
const folderVersion = async ({ world, t }) => (await world.people.member('GET', `/api/folders/${t.folder}`)).data.folder.version;

// Rows of the authorization matrix for encrypted files: the sealed blob store and shared folders.
// Both are for members holding a key to the doc or folder; guests are turned away before any of
// it, and nobody without a key learns a thing exists (`keyless` marks the few rows a member with
// no key to them may still use). See authzRowsOpen.js for what a row says.
export default {
  'POST /api/blobs': { allow: MEMBERS, body: ({ t }) => sealedBlob.body({ kind: 'doc', id: t.doc }, 10) },
  // an upload is the uploader's own; everyone else is answered as if it didn't exist
  'PUT /api/blobs/:id/chunks/:index': { allow: MEMBERS, id: 'own.blob', ...CHUNK },
  'POST /api/blobs/:id/finish': { allow: MEMBERS, id: 'own.filledBlob' },
  'GET /api/blobs': { allow: MEMBERS, keyless: true },
  'GET /api/blobs/:id/upload': { allow: MEMBERS, id: 'own.blob' },
  // any key holder to the doc may swap in a copy made while encrypting its files again
  'POST /api/blobs/:id/adopt': { allow: MEMBERS, id: 'fresh.docCopy' },
  'GET /api/blobs/:id': { allow: MEMBERS, id: 'blob' },
  'GET /api/blobs/:id/chunks/:index': { allow: MEMBERS, id: 'blob', index: () => '0' },
  // the member uploaded it; admins may delete any
  'DELETE /api/blobs/:id': { allow: MEMBERS, id: 'fresh.blob' },
  'GET /api/folders': { allow: MEMBERS, keyless: true },
  'POST /api/folders': { allow: MEMBERS, keyless: true, body: ({ world }, who) => ({ id: sharedFolder.freshId(), audience: 'people', nameCt: cipher(120), grants: sharedFolder.grants([world.ids[who] ?? world.ids.member]) }) },
  'GET /api/folders/:id': { allow: MEMBERS, id: 'folder' },
  'PUT /api/folders/:id': { allow: MEMBERS, id: 'folder', body: async (ctx) => ({ baseVersion: await folderVersion(ctx), nameCt: cipher(120) }) },
  'POST /api/folders/:id/grants': { allow: MEMBERS, id: 'folder', body: ({ world }) => ({ grants: sharedFolder.grants([world.ids.member]) }) },
  // the member made it; admins manage every folder
  'POST /api/folders/:id/rotate': { allow: MEMBERS, id: 'fresh.folder', body: ({ world }, who) => ({ baseVersion: 1, audience: 'team', nameCt: cipher(120), items: [], grants: sharedFolder.grants([world.ids[who] ?? world.ids.member]) }) },
  // the shared folder's name carries who it's for, so only whoever manages it names it
  'DELETE /api/folders/:id': { allow: MEMBERS, id: 'fresh.folder' },
  'POST /api/folders/:id/items': { allow: MEMBERS, id: 'folder', body: () => sharedFolder.item({ keyRev: 1 }, { kind: 'folder' }) },
  // the member made the folder and what's in it; admins manage every folder
  'PATCH /api/folders/:id/items/:itemId': { allow: MEMBERS, id: 'folder', itemId: 'folderItem', body: { parentId: null, keyRev: 1, metaCt: cipher(300) } },
  'DELETE /api/folders/:id/items/:itemId': { allow: MEMBERS, id: 'folder', itemId: 'fresh.folderItem' },
  'POST /api/folders/:id/items/move': { allow: MEMBERS, id: 'folder', body: async ({ t }) => ({ parentId: null, keyRev: 1, items: [{ id: await t.fresh.folderItem(), metaCt: cipher(300) }] }) },
  'POST /api/folders/:id/items/remove': { allow: MEMBERS, id: 'folder', body: async ({ t }) => ({ ids: [await t.fresh.folderItem()] }) },
  'POST /api/folders/:id/items/:itemId/restore': { allow: MEMBERS, id: 'folder', itemId: 'fresh.trashedItem' },
  'DELETE /api/folders/:id/trash/:itemId': { allow: MEMBERS, id: 'folder', itemId: 'fresh.trashedItem' },
  // every key holder's browser helps encrypt a folder again after someone was taken out
  'POST /api/folders/:id/reseal/claim': { allow: MEMBERS, id: 'resealFolder' },
  'POST /api/folders/:id/items/:itemId/reseal': { allow: MEMBERS, id: 'resealFolder', itemId: 'fresh.waitingItem', body: { keyRev: 1, keyWrap: cipher(60), metaCt: cipher(300) } },
};
