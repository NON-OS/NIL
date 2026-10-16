// Each workspace's share of the invoice suffixes when every workspace bills to one treasury.
// Slots are handed out once and never reused, so an old invoice can't collide with a new
// workspace's amounts.
export default `
  ALTER TABLE workspaces ADD COLUMN invoice_slot INTEGER;
  UPDATE workspaces SET invoice_slot = (
    SELECT n FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS n FROM workspaces) r WHERE r.id = workspaces.id
  );
  CREATE UNIQUE INDEX workspaces_invoice_slot ON workspaces(invoice_slot) WHERE invoice_slot IS NOT NULL;
`;
