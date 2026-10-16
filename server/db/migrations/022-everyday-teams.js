// Everyday teams. Three independent parts:
//
// 1. A switch for the crypto tools (bounties, votes, proof of work, private payouts, the token
//    holder door). Workspaces that exist today keep them on; setup writes the owner's choice.
//
// 2. Reusable invite links. Existing links stay single-use (max_uses 1). A link nobody used
//    yet is live until it expires, is revoked or runs out of uses; invite_joins says who came
//    in through which link.
//
// 3. Full-text search over team tasks. Triggers keep one row per task in step with its title,
//    notes, checklist and comments, so every write path indexes the same way. A private task
//    never gets a row: its words are ciphertext the server can't read, and the plain text of a
//    private task from before encryption stays out too. The rowid is the task number, which
//    never changes (a TEXT primary key's rowid can move on VACUUM). secure-delete makes FTS5
//    remove a row's tokens at once instead of leaving them in old segments until a merge, so
//    a task that turns private leaves nothing behind in the index.

const indexRow = (taskId) => `
    INSERT INTO task_search (rowid, title, body, checklist, comments)
    SELECT t.number, t.title, t.description,
      (SELECT group_concat(json_extract(i.value, '$.text'), ' ') FROM json_each(CASE WHEN json_valid(t.checklist) THEN t.checklist ELSE '[]' END) i),
      (SELECT group_concat(c.body, ' ') FROM comments c WHERE c.task_id = t.id AND c.sealed = 0)
    FROM tasks t WHERE t.id = ${taskId} AND t.private = 0 AND t.sealed IS NULL;`;

const dropRow = (taskId) => `
    DELETE FROM task_search WHERE rowid = (SELECT number FROM tasks WHERE id = ${taskId});`;

const everydayTeams = `
  ALTER TABLE workspace ADD COLUMN crypto_tools INTEGER NOT NULL DEFAULT 1;

  ALTER TABLE invites ADD COLUMN max_uses INTEGER DEFAULT 1;
  ALTER TABLE invites ADD COLUMN uses INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE invites ADD COLUMN revoked_at INTEGER;
  UPDATE invites SET uses = 1 WHERE used_at IS NOT NULL;

  CREATE TABLE invite_joins (
    invite_hash TEXT NOT NULL REFERENCES invites(token_hash) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (invite_hash, user_id)
  );
  INSERT INTO invite_joins (invite_hash, user_id, joined_at)
    SELECT token_hash, used_by, used_at FROM invites WHERE used_by IS NOT NULL AND used_at IS NOT NULL;

  CREATE VIRTUAL TABLE task_search USING fts5(title, body, checklist, comments, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
  INSERT INTO task_search (task_search, rank) VALUES ('secure-delete', 1);

  CREATE TRIGGER task_search_insert AFTER INSERT ON tasks BEGIN ${indexRow('NEW.id')}
  END;
  CREATE TRIGGER task_search_update AFTER UPDATE OF number, title, description, checklist, private, sealed ON tasks BEGIN
    DELETE FROM task_search WHERE rowid = OLD.number; ${indexRow('NEW.id')}
  END;
  CREATE TRIGGER task_search_delete AFTER DELETE ON tasks BEGIN
    DELETE FROM task_search WHERE rowid = OLD.number;
  END;
  CREATE TRIGGER task_search_comment_insert AFTER INSERT ON comments BEGIN ${dropRow('NEW.task_id')} ${indexRow('NEW.task_id')}
  END;
  CREATE TRIGGER task_search_comment_update AFTER UPDATE OF body, sealed ON comments BEGIN ${dropRow('NEW.task_id')} ${indexRow('NEW.task_id')}
  END;
  CREATE TRIGGER task_search_comment_delete AFTER DELETE ON comments BEGIN ${dropRow('OLD.task_id')} ${indexRow('OLD.task_id')}
  END;

  INSERT INTO task_search (rowid, title, body, checklist, comments)
    SELECT t.number, t.title, t.description,
      (SELECT group_concat(json_extract(i.value, '$.text'), ' ') FROM json_each(CASE WHEN json_valid(t.checklist) THEN t.checklist ELSE '[]' END) i),
      (SELECT group_concat(c.body, ' ') FROM comments c WHERE c.task_id = t.id AND c.sealed = 0)
    FROM tasks t WHERE t.private = 0 AND t.sealed IS NULL;
`;

export default everydayTeams;
