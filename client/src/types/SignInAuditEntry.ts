// One step in the sign-in audit log. Ids are null for accounts that were deleted since.
export default interface SignInAuditEntry {
  id: number;
  action: 'reset.requested' | 'reset.approved' | 'reset.issued' | 'reset.cancelled' | 'reset.used' | 'wallet.linked' | 'wallet.removed';
  actorId: string | null;
  subjectId: string | null;
  data: { unapproved?: boolean; replaced?: boolean };
  createdAt: number;
}
