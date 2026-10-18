// Passkeys as one more wrap of a member's identity, next to the wallet wraps. The key behind
// each wrap comes from the passkey's PRF output, which never leaves the browser, so the server
// keeps only what the browser needs to ask for it again: the credential id and the salt.
// kit_saved_at records that the person downloaded a recovery kit for their current keys, so a
// passkey is never their only way back. A reset clears it, since the old kit holds the old keys.
const passkeyWraps = `
  CREATE TABLE passkey_wraps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL,
    salt TEXT NOT NULL,
    wrapped TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    UNIQUE (user_id, credential_id)
  );

  ALTER TABLE encryption_keys ADD COLUMN kit_saved_at INTEGER;
`;

export default passkeyWraps;
