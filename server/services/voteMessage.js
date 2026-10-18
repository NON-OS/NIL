import oneLine from '../lib/oneLine.js';

const flat = oneLine.flatten;

// The exact text a voter's wallet signs. It names the workspace, proposal, choice and voter,
// so a signature can't be replayed on another proposal or counted for someone else. The choice
// is named by its words and by its number among the options, counting from 1. Values are kept
// to one line each, so none can add a line that reads like another field.
export default function voteMessage({ workspace, proposal, options, choice, userId, nonce, issuedAt }) {
  return [
    'NONOS vote',
    '',
    `Workspace: ${flat(workspace)}`,
    `Proposal: ${flat(proposal.title)}`,
    `Proposal ID: ${proposal.id}`,
    `Choice: ${flat(options[choice])}`,
    `Option: ${choice + 1} of ${options.length}`,
    `Voter: ${userId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}
