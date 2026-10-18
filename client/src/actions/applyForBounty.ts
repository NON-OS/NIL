import http from '../api/http';
import ethereum from '../lib/ethereum';
import signServerText from '../lib/signServerText';

// Applying signs one message with your wallet. No account, no email: the signature proves you
// control the address you'd be paid at. If the team accepts, you sign in with that wallet.
export default async function applyForBounty(bountyId: string, name: string, pitch: string) {
  const { address } = await ethereum.account();
  const { challengeId, message } = await http.post<{ challengeId: string; message: string }>(`/public/bounties/${bountyId}/challenge`, { address, name, pitch });
  const signature = await signServerText(message, address);
  await http.post(`/public/bounties/${bountyId}/apply`, { challengeId, signature });
}
