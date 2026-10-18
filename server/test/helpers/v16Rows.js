// A row in every table of a 3.0.0 database (schema 16), on top of the few the fixture already
// holds, written against that schema as 3.0.0 itself would have. `at` is the fixture's own time.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const W = (n) => `0x${String(n).repeat(40)}`;

export default function v16Rows(at) {
  const later = at + 1_234_567;
  return `
    INSERT INTO users (id, name, role, color, joined_via, created_at, stealth_meta, semaphore_commitment) VALUES ('u-member', 'Member', 'member', '#0e9384', 'invite', ${at}, 'st:eth:0xmeta', '123');
    INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES ('c-member', 'u-member', 'wallet', '${W(2)}', 'Ethereum wallet', ${at});
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('s-hash', 'u-member', ${at}, ${at + 30 * DAY});
    INSERT INTO invites (token_hash, role, created_by, created_at, expires_at, used_by, used_at, project_ids) VALUES ('i-hash', 'member', 'u-owner', ${at}, ${at + 7 * DAY}, 'u-member', ${at}, '[]');
    INSERT INTO projects (id, name, key, color, lead_id, created_by, created_at) VALUES ('p-one', 'Launch', 'LAU', '#5b5bd6', 'u-owner', 'u-owner', ${at});
    INSERT INTO labels (id, name, color, created_at) VALUES ('l-one', 'urgent', '#e5484d', ${at});
    INSERT INTO goals (id, title, owner_id, created_by, created_at, updated_at) VALUES ('g-one', 'Ship it', 'u-owner', 'u-owner', ${at}, ${at});
    INSERT INTO tasks (id, number, title, project_id, goal_id, assignee_id, creator_id, labels, status, bounty, bounty_token, created_at, updated_at, completed_at)
      VALUES ('t-two', 2, 'Pay the designer', 'p-one', 'g-one', 'u-member', 'u-owner', '["l-one"]', 'done', '100', 'NOX', ${at}, ${at}, ${at});
    INSERT INTO tasks (id, number, title, creator_id, private, created_at, updated_at) VALUES ('t-private', 3, 'Private notes', 'u-member', 1, ${at}, ${at});
    UPDATE workspace SET task_seq = 3;
    INSERT INTO watchers (task_id, user_id) VALUES ('t-two', 'u-member');
    INSERT INTO attachments (id, task_id, uploader_id, filename, mime, size, created_at) VALUES ('a-one', 't-two', 'u-member', 'invoice.pdf', 'application/pdf', 1234, ${at});
    INSERT INTO activity (task_id, actor_id, type, data, created_at) VALUES ('t-two', 'u-owner', 'status', '{"from":"todo","to":"done"}', ${at});
    INSERT INTO focus (user_id, task_id, day, position) VALUES ('u-member', 't-two', '2026-10-15', 1);
    INSERT INTO receipts (id, seq, task_id, user_id, title, salt, body, hash, signature, created_at, kind) VALUES ('r-one', 1, 't-two', 'u-member', 'Pay the designer', 'salt', '{}', 'hash', 'sig', ${at}, 'work');
    INSERT INTO settings (key, value) VALUES ('plan', '{"paidUntil":1800000000000}'), ('retention', '{"doneDays":0,"commentDays":0,"activityDays":0}');
    INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, tx_hash, status, receipt_id, created_at, token)
      VALUES ('pay-one', 't-two', 'FIX-2', 'u-owner', 'u-member', '${W(2)}', '100', '0x${'a'.repeat(64)}', 'confirmed', 'r-one', ${at}, 'NOX');
    INSERT INTO proposals (id, title, options, weighting, created_by, created_at, closes_at, anonymous) VALUES ('v-one', 'Offsite?', '["Yes","No"]', 'power', 'u-owner', ${at}, ${at + 7 * DAY}, 1);
    INSERT INTO votes (proposal_id, user_id, choice, weight, address, message, signature, created_at) VALUES ('v-one', 'u-owner', 0, '1', '${W(1)}', 'msg', 'sig', ${at});
    INSERT INTO time_entries (id, user_id, task_id, note, started_at, ended_at, created_at) VALUES ('te-one', 'u-member', 't-two', 'design review', ${at}, ${at + HOUR}, ${at});
    INSERT INTO reminders (id, user_id, task_id, note, remind_at, created_at) VALUES ('rem-one', 'u-member', 't-two', 'chase the invoice', ${at + DAY}, ${at});
    INSERT INTO encryption_keys (user_id, public_key, created_at) VALUES ('u-member', 'old-public-key', ${at});
    INSERT INTO docs (id, title_ct, body_ct, created_by, updated_by, created_at, updated_at) VALUES ('d-one', 'title-ct', 'body-ct', 'u-owner', 'u-owner', ${at}, ${at});
    INSERT INTO doc_keys (doc_id, user_id, wrapped_key, granted_by, created_at) VALUES ('d-one', 'u-member', 'wrapped', 'u-owner', ${at});
    INSERT INTO doc_revisions (doc_id, version, title_ct, body_ct, updated_by, created_at) VALUES ('d-one', 1, 'title-ct-0', 'body-ct-0', 'u-owner', ${at});
    INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at) VALUES ('k-one', 'u-owner', 'Script', 'k-hash', 'read', ${at});
    INSERT INTO project_guests (project_id, user_id) VALUES ('p-one', 'u-member');
    INSERT INTO share_links (id, token_hash, kind, target_id, created_by, created_at) VALUES ('sl-one', 'sl-hash', 'task', 't-two', 'u-owner', ${at});
    INSERT INTO applications (id, task_id, address, name, pitch, created_at) VALUES ('app-one', 't-two', '${W(3)}', 'Outsider', 'I can do it', ${at});
    INSERT INTO plan_payments (id, payer_id, tx_hash, status, amount, periods, from_address, block_number, created_at, checked_at, confirmed_at)
      VALUES ('pp-one', 'u-owner', '0x${'b'.repeat(64)}', 'confirmed', '5', 1, '${W(1)}', 99, ${at}, ${at}, ${at});
    INSERT INTO proposal_voters (proposal_id, position, commitment, power) VALUES ('v-one', 0, '123', '1');
    INSERT INTO proposal_roots (proposal_id, root, created_at) VALUES ('v-one', 'root-one', ${later});
    INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES ('v-one', 'null-one', 0, '{}', ${later});
    INSERT INTO proposal_power (proposal_id, user_id, nox, staked, zsp, power) VALUES ('v-one', 'u-owner', '1', '0', 0, '1');
    INSERT INTO proposal_trustees (proposal_id, position, user_id) VALUES ('v-one', 1, 'u-member');
    INSERT INTO encrypted_ballots (proposal_id, nullifier, ciphertexts, proof, created_at) VALUES ('v-one', 'null-two', '[]', '{}', ${later});
  `;
}
