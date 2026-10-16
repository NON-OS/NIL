// Signed ballots from smart-contract wallets. A plain wallet's ballot is checked by recovering
// its key; a smart wallet's can only be checked on-chain, so each ballot records which check it
// passed and, for the on-chain ones, at which block, so a recount can repeat it.
const smartWalletBallots = `
  ALTER TABLE votes ADD COLUMN checked_by TEXT NOT NULL DEFAULT 'ecrecover';
  ALTER TABLE votes ADD COLUMN checked_block INTEGER;
`;

export default smartWalletBallots;
