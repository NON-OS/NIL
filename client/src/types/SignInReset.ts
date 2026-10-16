// A reset of someone's sign-in that's still open: waiting for a second admin, or a link not yet used.
export default interface SignInReset {
  id: string;
  userId: string;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: number;
  expiresAt: number;
  awaitingApproval: boolean;
}
