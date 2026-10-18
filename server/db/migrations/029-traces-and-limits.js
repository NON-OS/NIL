// Admins can close a listed bounty to new applications without taking it off the board.
const tracesAndLimits = `
  ALTER TABLE tasks ADD COLUMN applications_closed_at INTEGER;
`;

export default tracesAndLimits;
