import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const KINDS = {
  doc: { owner: 'SELECT d.created_by FROM docs d JOIN doc_keys k ON k.doc_id = d.id AND k.user_id = ? WHERE d.id = ?', missing: 'That doc' },
  folder: { owner: 'SELECT f.created_by FROM folders f JOIN folder_keys k ON k.folder_id = f.id AND k.user_id = ? WHERE f.id = ?', missing: 'That folder' },
};

// Where a sealed blob belongs, which decides who may put it there and fetch it: a doc, for whoever
// holds a key to the doc, or a shared folder, for whoever holds a key to the folder. The same
// people who can open the doc or folder, and nobody else; to anyone else it doesn't exist.
const blobScope = {
  parse(value) {
    const kind = value?.kind;
    if (!Object.hasOwn(KINDS, kind) || typeof value.id !== 'string' || !ID.test(value.id)) throw HttpError.badRequest('Say which doc or folder the file is for.');
    return { kind, id: value.id };
  },

  // The scope's creator, once the person is shown to hold a key to it.
  open(kind, id, user) {
    const row = Object.hasOwn(KINDS, kind) ? sql.get(KINDS[kind].owner, user.id, id) : null;
    if (!row) throw HttpError.notFound(KINDS[kind]?.missing ?? 'That file');
    return { kind, id, createdBy: row.created_by };
  },
};

export default blobScope;
