// Public votes: a signed vote weighted by voting power that any NOX holder can vote in and anyone
// can watch, on a page at an address nobody can guess. A ballot from a wallet that belongs to no
// member is kept apart from members' ballots, one per wallet, with the holdings its power came
// from as read at the vote's snapshot block.
const publicVotes = `
  ALTER TABLE proposals ADD COLUMN public_slug TEXT;
  CREATE UNIQUE INDEX proposals_public_slug ON proposals(public_slug) WHERE public_slug IS NOT NULL;

  CREATE TABLE outside_votes (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    choice INTEGER NOT NULL,
    nox TEXT NOT NULL,
    staked TEXT NOT NULL,
    zsp INTEGER NOT NULL,
    weight TEXT NOT NULL,
    message TEXT NOT NULL,
    signature TEXT NOT NULL,
    checked_by TEXT NOT NULL,
    checked_block INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, address)
  );
`;

export default publicVotes;
