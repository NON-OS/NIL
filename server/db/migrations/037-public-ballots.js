// A signed vote can show every member who voted what, the way a DAO's votes are public. Votes
// started before this keep their old promise, that only admins could see the choices: people
// voted in them on that understanding, so the setting starts off for every one of them.
const publicBallots = `
  ALTER TABLE proposals ADD COLUMN public_ballots INTEGER NOT NULL DEFAULT 0;
`;

export default publicBallots;
