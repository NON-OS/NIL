// Indexes under the foreign keys of tables added after 034: the pool account and its keys
// (032), which erasing a member looks through, and each wallet's power in a weighted vote (035).
const laterLookupIndexes = `
  CREATE INDEX IF NOT EXISTS pool_account_created_by ON pool_account(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS pool_account_notes_by ON pool_account(notes_by) WHERE notes_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS pool_account_keys_granted_by ON pool_account_keys(granted_by) WHERE granted_by IS NOT NULL;
  CREATE INDEX IF NOT EXISTS proposal_wallet_power_user ON proposal_wallet_power(user_id);
`;

export default laterLookupIndexes;
