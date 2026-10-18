// Invoice slots come from a counter that only goes up. Taking the highest slot in use plus one
// handed a slot out again once the workspace holding it had been forgotten.
export default `
  CREATE TABLE counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  INSERT INTO counters (name, value) SELECT 'invoice_slot', COALESCE(MAX(invoice_slot), -1) + 1 FROM workspaces;
`;
