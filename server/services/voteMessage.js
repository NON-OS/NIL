// The exact text a voter's wallet signs. It names the workspace, proposal, choice and voter,
// so a signature can't be replayed on another proposal or counted for someone else.
export default function voteMessage({ workspace, proposal, choice, userId, nonce, issuedAt }) {
  return [
    'NONOS vote',
    '',
    `Workspace: ${workspace}`,
    `Proposal: ${proposal.title}`,
    `Proposal ID: ${proposal.id}`,
    `Choice: ${choice}`,
    `Voter: ${userId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}
