// How many times a doc has moved to a new key. Live changes carry the number they were sealed
// under, so one sealed under a key the doc has left is turned away instead of kept where nobody
// holding the new key can open it.
const docKeyEpoch = `
  ALTER TABLE docs ADD COLUMN key_epoch INTEGER NOT NULL DEFAULT 0;
`;

export default docKeyEpoch;
