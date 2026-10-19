import http from '../api/http';
import ethereum from '../lib/ethereum';
import signServerText from '../lib/signServerText';
import saveBlob from '../lib/saveBlob';
import type PublicVote from '../types/PublicVote';

// A public vote from its own page: no account and no session. The wallet is the browser's, or a
// wallet app on the phone where the server offers one, and it signs one ballot text the server
// wrote for this wallet and this choice.
const publicVotes = {
  get: (slug: string) => http.get<PublicVote>(`/public/votes/${slug}`),

  async cast(slug: string, choice: number) {
    const { address } = await ethereum.account();
    const { challengeId, message } = await http.post<{ challengeId: string; message: string }>(`/public/votes/${slug}/challenge`, { address, choice });
    const signature = await signServerText(message, address);
    return http.post<{ counted: { weight: string }; vote: PublicVote }>(`/public/votes/${slug}/ballot`, { challengeId, signature });
  },

  async audit(vote: PublicVote) {
    const data = await http.get<unknown>(`/public/votes/${vote.id}/audit`);
    const slug = vote.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `nonos-public-vote-${slug}.json`);
  },
};

export default publicVotes;
