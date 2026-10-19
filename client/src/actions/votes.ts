import http from '../api/http';
import ethereum from '../lib/ethereum';
import signServerText from '../lib/signServerText';
import saveBlob from '../lib/saveBlob';
import type Proposal from '../types/Proposal';

interface NewProposal {
  title: string;
  body: string;
  options: string[];
  weighting: 'equal' | 'power';
  sealed: boolean;
  anonymous: boolean;
  // signed votes only: every member sees who voted what
  publicBallots: boolean;
  // weighted signed votes only: open to any NOX holder on a page anyone can watch
  publicVote: boolean;
  days: number;
  // three members who hold the decryption key together (encrypted, weighted votes only)
  trustees?: string[];
}

const votes = {
  list: () => http.get<Proposal[]>('/proposals'),
  create: (input: NewProposal) => http.post<{ proposal: Proposal }>('/proposals', input).then((r) => r.proposal),

  // The server writes the ballot, the voter's wallet signs it. A signature is the vote.
  async cast(id: string, choice: number) {
    const { address } = await ethereum.account();
    const { ballotId, message } = await http.post<{ ballotId: string; message: string }>(`/proposals/${id}/ballot`, { choice });
    const signature = await signServerText(message, address);
    // a smart wallet's signature doesn't say who made it, so the wallet's address goes along
    return http.post<{ proposal: Proposal }>(`/proposals/${id}/vote`, { ballotId, signature, address }).then((r) => r.proposal);
  },

  close: (id: string) => http.post<{ proposal: Proposal }>(`/proposals/${id}/close`).then((r) => r.proposal),
  remove: (id: string) => http.del(`/proposals/${id}`),

  async audit(proposal: Proposal) {
    const data = await http.get<unknown>(`/proposals/${proposal.id}/audit`);
    const slug = proposal.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `nonos-vote-${slug}.json`);
  },
};

export default votes;
