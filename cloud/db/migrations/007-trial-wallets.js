// One free trial per wallet across hosted workspaces. A wallet is kept only as the keyed tag the
// logs already use (lib/walletTagger.js), so the list can't be read back into addresses, and it
// outlives the workspaces themselves. Each workspace records whether it got the trial, since its
// settings are rebuilt from that every time it starts.
export default `
  ALTER TABLE workspaces ADD COLUMN trial INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE trial_wallets (tag TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
`;
