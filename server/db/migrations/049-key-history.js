// Keys people replaced, with the wallet signature they were published with. Browsers check what
// a member signed before their keys changed against the key they had then; without these, only a
// browser that happened to confirm the old key before it changed could, and a newcomer never.
const keyHistory = `
  CREATE TABLE encryption_key_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    signing_key TEXT NOT NULL,
    address TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    replaced_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, created_at)
  );
`;

export default keyHistory;
