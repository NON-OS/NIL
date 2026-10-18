import http from '../api/http';
import session from './session';
import ethereum from '../lib/ethereum';
import signServerText from '../lib/signServerText';
import backupNudge from '../state/backupNudge';
import type JoinDetails from '../types/JoinDetails';
import type SecurityOverview from '../types/SecurityOverview';

async function walletCeremony(body: Record<string, unknown>) {
  const { address, chainId } = await ethereum.account();
  const { challengeId, message } = await http.post<{ challengeId: string; message: string }>('/auth/wallet/challenge', { ...body, address, chainId });
  const signature = await signServerText(message, address);
  return http.post('/auth/wallet/verify', { challengeId, signature });
}

// An Ethereum wallet is the only key to Nil. No email, no password, no biometrics.
const identity = {
  async walletLogin() {
    await walletCeremony({ mode: 'login' });
    await session.enter();
  },

  async walletJoin(details: JoinDetails) {
    await walletCeremony({ ...details });
    if (details.mode !== 'setup') history.replaceState(null, '', '/');
    await session.enter();
    backupNudge.show();
  },

  // From a reset link an admin made: links a new wallet to the same account and signs in, then
  // opens the wallet list so the lost ones can be removed. A full load, because the link may
  // have been opened in a tab signed in as someone else, whose keys and live updates must go.
  async resetSignIn(resetToken: string) {
    await walletCeremony({ mode: 'reset', resetToken });
    location.replace('/settings?tab=security&reset=1');
  },

  // A fresh signature from a wallet already linked here, which linking another wallet or making
  // an access key needs. It's good for a few minutes, in this session only.
  confirm: () => walletCeremony({ mode: 'confirm' }) as Promise<{ ok: true; until: number }>,

  linkWallet: () => walletCeremony({ mode: 'add' }),

  overview: () => http.get<SecurityOverview>('/me/credentials'),
  rename: (id: string, label: string) => http.patch<SecurityOverview>(`/me/credentials/${id}`, { label }),
  remove: (id: string) => http.del<SecurityOverview>(`/me/credentials/${id}`),
  shareWallet: (on: boolean) => http.patch<SecurityOverview>('/me/privacy', { shareWallet: on }),
};

export default identity;
