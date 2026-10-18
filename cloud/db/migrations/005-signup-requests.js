// Sign-ups waiting for the operator: past the daily cap, or when the server is nearly full, a
// signed sign-up becomes a request instead of a workspace. The setup token is made (and shown
// to the person) at once, so approving later needs nothing more from them. The name is held
// while the request waits; requests expire after CLOUD_SIGNUP_REQUEST_DAYS.
export default `
  CREATE TABLE signup_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    setup_token TEXT NOT NULL,
    requested_at INTEGER NOT NULL
  );
  CREATE INDEX signup_requests_owner ON signup_requests(owner);
`;
