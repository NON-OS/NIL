import crypto from 'node:crypto';
import cipher from './cipher.js';

// Shared folders and the things in them as a browser makes them. Names, details and keys are
// ciphertext the server can't read, so random base64url of the right sizes stands in.
const freshId = () => crypto.randomBytes(16).toString('base64url');

const sharedFolder = {
  freshId,
  grants: (userIds) => userIds.map((userId) => ({ userId, wrappedKey: cipher(92) })),

  async create(c, userIds, { audience = 'people' } = {}) {
    const id = freshId();
    const res = await c('POST', '/api/folders', { id, audience, nameCt: cipher(120), grants: sharedFolder.grants(userIds) });
    if (res.status !== 200) throw new Error(`folder answered ${res.status}: ${JSON.stringify(res.data)}`);
    return res.data.folder;
  },

  // A file whose blob is uploaded already, or a subfolder.
  item: (folder, extra = {}) => ({ id: freshId(), kind: 'file', parentId: null, keyRev: folder.keyRev, keyWrap: cipher(60), metaCt: cipher(300), ...extra }),
  add: (c, folder, extra) => c('POST', `/api/folders/${folder.id}/items`, sharedFolder.item(folder, extra)),
};

export default sharedFolder;
