// A reset of someone's sign-in that's still open: waiting for a second admin, waiting out the
// delay for an owner nobody could approve (readyAt), or a link not yet used.
export default interface SignInReset {
  id: string;
  userId: string;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: number;
  expiresAt: number;
  readyAt: number | null;
  awaitingApproval: boolean;
}
