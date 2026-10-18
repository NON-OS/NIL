// An index under every foreign key that had none. Erasing a task, a person, a goal or a credential
// makes SQLite find the rows that point at it, and without an index it reads the whole table each
// time: erasing one member read every activity entry and notification several times over, and the
// purge did the same for each task it erased. Columns that are mostly empty get partial indexes.
//
// Then the lookups the app runs all the time: unread counts, the start of each person's archive,
// the minute-by-minute due-date check, finished tasks for the retention sweep, expired sessions,
// an outsider's pending bounty applications, each person's upload total and old agent logs.
const lookupIndexes = `
  CREATE INDEX IF NOT EXISTS tasks_goal ON tasks(goal_id) WHERE goal_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS focus_task ON focus(task_id);
  CREATE INDEX IF NOT EXISTS reminders_task ON reminders(task_id) WHERE task_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS reminders_user ON reminders(user_id);
  CREATE INDEX IF NOT EXISTS time_entries_task ON time_entries(task_id) WHERE task_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_due_notices_task ON agent_due_notices(task_id);

  CREATE INDEX IF NOT EXISTS watchers_user ON watchers(user_id);
  CREATE INDEX IF NOT EXISTS comments_author ON comments(author_id) WHERE author_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS attachments_uploader ON attachments(uploader_id) WHERE uploader_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS activity_actor ON activity(actor_id) WHERE actor_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS activity_acting_for ON activity(acting_for) WHERE acting_for IS NOT NULL;
  CREATE INDEX IF NOT EXISTS notifications_actor ON notifications(actor_id) WHERE actor_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS invites_created_by ON invites(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS invites_used_by ON invites(used_by) WHERE used_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS invite_joins_user ON invite_joins(user_id);
  CREATE INDEX IF NOT EXISTS share_links_created_by ON share_links(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS projects_lead ON projects(lead_id) WHERE lead_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS projects_created_by ON projects(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS goals_owner ON goals(owner_id) WHERE owner_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS goals_created_by ON goals(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS docs_created_by ON docs(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS docs_updated_by ON docs(updated_by) WHERE updated_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS doc_keys_granted_by ON doc_keys(granted_by) WHERE granted_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS doc_revisions_updated_by ON doc_revisions(updated_by) WHERE updated_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS proposals_created_by ON proposals(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS votes_user ON votes(user_id);
  CREATE INDEX IF NOT EXISTS proposal_power_user ON proposal_power(user_id);
  CREATE INDEX IF NOT EXISTS proposal_trustees_user ON proposal_trustees(user_id) WHERE user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS applications_decided_by ON applications(decided_by) WHERE decided_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS identity_wraps_address ON identity_wraps(address);
  CREATE INDEX IF NOT EXISTS sign_in_resets_requested_by ON sign_in_resets(requested_by) WHERE requested_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS sign_in_resets_approved_by ON sign_in_resets(approved_by) WHERE approved_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS sign_in_audit_actor ON sign_in_audit(actor_id) WHERE actor_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS sign_in_audit_subject ON sign_in_audit(subject_id) WHERE subject_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS payments_payer ON payments(payer_id) WHERE payer_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS payments_intent ON payments(intent_id) WHERE intent_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS payments_receipt ON payments(receipt_id) WHERE receipt_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS payment_intents_payer ON payment_intents(payer_id) WHERE payer_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS payment_intents_payee ON payment_intents(payee_id) WHERE payee_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS billing_invoices_retry_of ON billing_invoices(retry_of) WHERE retry_of IS NOT NULL;

  CREATE INDEX IF NOT EXISTS agents_created_by ON agents(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_runs_acting_for ON agent_runs(acting_for) WHERE acting_for IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_approvals_agent ON agent_approvals(agent_id);
  CREATE INDEX IF NOT EXISTS agent_approvals_run ON agent_approvals(run_id) WHERE run_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_approvals_acting_for ON agent_approvals(acting_for) WHERE acting_for IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_approvals_decided_by ON agent_approvals(decided_by) WHERE decided_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_audit_actor ON agent_audit(actor_id) WHERE actor_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_audit_acting_for ON agent_audit(acting_for) WHERE acting_for IS NOT NULL;

  CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
  CREATE INDEX IF NOT EXISTS tasks_closed ON tasks(updated_at) WHERE deleted_at IS NULL AND status IN ('done', 'canceled');
  CREATE INDEX IF NOT EXISTS tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
  CREATE INDEX IF NOT EXISTS tasks_completed ON tasks(completed_at) WHERE status = 'done';
  CREATE INDEX IF NOT EXISTS tasks_canceled ON tasks(updated_at) WHERE status = 'canceled';
  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS applications_pending ON applications(address) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS agent_steps_created ON agent_steps(created_at);
  CREATE INDEX IF NOT EXISTS agent_runs_summary ON agent_runs(created_at) WHERE summary IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_audit_created ON agent_audit(created_at);
  CREATE INDEX IF NOT EXISTS agent_idempotency_created ON agent_idempotency(created_at);
`;

export default lookupIndexes;
