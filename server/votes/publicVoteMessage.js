import oneLine from '../lib/oneLine.js';

const flat = oneLine.flatten;

// The exact text a wallet signs to vote on a public vote's page. It names the server it was
// given on, the workspace, the vote, the choice and the wallet, so a signature can't be replayed
// on another vote, another server or for another wallet. The choice is named by its words and by
// its number among the options, counting from 1, like a member's signed ballot.
export default function publicVoteMessage({ origin, workspace, proposal, options, choice, address, chainId, nonce, issuedAt }) {
  return [
    'NONOS public vote',
    '',
    `Site: ${origin}`,
    `Workspace: ${flat(workspace)}`,
    `Proposal: ${flat(proposal.title)}`,
    `Proposal ID: ${proposal.id}`,
    `Choice: ${flat(options[choice])}`,
    `Option: ${choice + 1} of ${options.length}`,
    `Wallet: ${address}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    '',
    'Your wallet, your choice and your voting power will be shown to everyone. This is not a transaction and costs nothing.',
  ].join('\n');
}
