import type SignInAuditEntry from '../types/SignInAuditEntry';

// One line of the sign-in log in plain words, given a way to name people by id.
export default function describeSignInEvent(entry: SignInAuditEntry, nameOf: (id: string | null) => string) {
  const actor = nameOf(entry.actorId);
  const subject = nameOf(entry.subjectId);
  switch (entry.action) {
    case 'reset.requested':
      return `${actor} asked to reset ${subject}’s sign-in`;
    case 'reset.approved':
      return `${actor} approved resetting ${subject}’s sign-in`;
    case 'reset.issued':
      return `${actor} made a sign-in reset link for ${subject}${entry.data.unapproved ? ', with no second admin to approve' : ''}`;
    case 'reset.cancelled':
      return entry.data.replaced ? `${actor} replaced an earlier reset link for ${subject}` : `${actor} cancelled a sign-in reset for ${subject}`;
    case 'reset.used':
      return `${subject} signed in with a new wallet from a reset link`;
    case 'wallet.linked':
      return `${subject} linked a wallet`;
    case 'wallet.removed':
      return `${subject} removed a wallet`;
    default:
      return `${actor} changed ${subject}’s sign-in`;
  }
}
