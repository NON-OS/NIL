// The workspace's own AI provider for built-in AI and agents: which service, its address for an
// OpenAI-compatible one, the model, and the admin's API key sealed with the server's secret box
// (agents/secretBox.js). Only the key's last four characters are kept in the clear, to show
// which key is set. One row at most.
const aiProvider = `
  CREATE TABLE ai_provider (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    kind TEXT NOT NULL CHECK (kind IN ('anthropic', 'openai', 'compatible')),
    base_url TEXT,
    model TEXT NOT NULL,
    key_ct TEXT,
    key_tail TEXT,
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  );
`;

export default aiProvider;
