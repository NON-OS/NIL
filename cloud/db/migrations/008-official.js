// Workspaces the operator marks official may put votes to every NOX holder. Everyone else's votes
// stay inside their own workspace, so a holder vote on this domain always comes from the project.
export default `
  ALTER TABLE workspaces ADD COLUMN official INTEGER NOT NULL DEFAULT 0;
`;
