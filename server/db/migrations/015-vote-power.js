// Weighted votes count a snapshot of each member's voting power, read at one block when the
// vote opens: NOX held, NOX staked, and ZSPs at the workspace's power per ZSP.
const votePower = `
  ALTER TABLE proposals ADD COLUMN snapshot_block INTEGER;
  ALTER TABLE proposals ADD COLUMN zsp_power TEXT;

  CREATE TABLE proposal_power (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nox TEXT NOT NULL,
    staked TEXT NOT NULL,
    zsp INTEGER NOT NULL,
    power TEXT NOT NULL,
    PRIMARY KEY (proposal_id, user_id)
  );
`;

export default votePower;
