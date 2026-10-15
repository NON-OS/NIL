// Bounties can be paid in more than one token. Existing bounties were NOX.
const rewardTokens = `
  ALTER TABLE tasks ADD COLUMN bounty_token TEXT;
  ALTER TABLE payments ADD COLUMN token TEXT NOT NULL DEFAULT 'NOX';
`;

export default rewardTokens;
