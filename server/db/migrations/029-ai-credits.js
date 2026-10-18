// Anonymous AI requests. Each spends one nullifier: unique to a member and a (day, slot) scope,
// unlinkable to anything else they do. Nullifiers keep only their day, never a time, and the
// table keeps no arrival order (no rowid; rows sort by nullifier). They go once their day is
// over; what stays is a count per day. Recent group roots are kept with the members they hold,
// so a root that still holds someone who has since left can be refused, and with the minute a
// newer root replaced them (null for the current one).
const aiCredits = `
  CREATE TABLE ai_credit_nullifiers (
    scope TEXT NOT NULL,
    nullifier TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (scope, nullifier)
  ) WITHOUT ROWID;
  CREATE INDEX ai_credit_nullifiers_day ON ai_credit_nullifiers (day);

  CREATE TABLE ai_credit_usage (
    day TEXT PRIMARY KEY,
    requests INTEGER NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE ai_credit_roots (
    root TEXT PRIMARY KEY,
    members TEXT NOT NULL,
    replaced_at INTEGER
  ) WITHOUT ROWID;
`;

export default aiCredits;
