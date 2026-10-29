import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';

const TOO_DEEP = `Folders can nest ${config.files.depthMax} deep here. Put this somewhere higher up.`;

// Keeps folders inside a shared folder from nesting deeper than FOLDER_DEPTH_MAX, counting the
// shared folder's own contents as level 1. `under` is where something goes (null for the top) and
// `levels` how many levels it brings: 1 for a file or an empty folder, more for a folder with
// folders inside it.
const folderDepth = {
  check(under, levels = 1) {
    const above = under
      ? sql.get('WITH RECURSIVE up(id, parent_id, n) AS (SELECT id, parent_id, 1 FROM folder_items WHERE id = ? UNION ALL SELECT i.id, i.parent_id, up.n + 1 FROM folder_items i JOIN up ON i.id = up.parent_id WHERE up.n <= ?) SELECT MAX(n) AS n FROM up', under, config.files.depthMax).n
      : 0;
    if (above + levels > config.files.depthMax) throw HttpError.badRequest(TOO_DEEP);
  },

  // how many levels an item and everything inside it take up
  levels(itemId) {
    return sql.get('WITH RECURSIVE down(id, n) AS (SELECT ?, 1 UNION ALL SELECT i.id, down.n + 1 FROM folder_items i JOIN down ON i.parent_id = down.id WHERE down.n <= ?) SELECT MAX(n) AS n FROM down', itemId, config.files.depthMax).n;
  },
};

export default folderDepth;
