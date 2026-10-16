import http from '../api/http';
import session from './session';
import ethereum from '../lib/ethereum';
import assertNotKeyMessage from '../lib/crypto/assertNotKeyMessage';
import type JoinDetails from '../types/JoinDetails';
import type SecurityOverview from '../types/SecurityOverview';

async function walletCeremony(body: Record<string, unknown>) {
  const { address, chainId } = await ethereum.account();
  const { challengeId, message } = await http.post<{ challengeId: string; message: string }>('/auth/wallet/challenge', { ...body, address, chainId });
  assertNotKeyMessage(message);
  const signature = await ethereum.sign(message, address);
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
  },

  linkWallet: () => walletCeremony({ mode: 'add' }),

  overview: () => http.get<SecurityOverview>('/me/credentials'),
  rename: (id: string, label: string) => http.patch<SecurityOverview>(`/me/credentials/${id}`, { label }),
  remove: (id: string) => http.del<SecurityOverview>(`/me/credentials/${id}`),
  shareWallet: (on: boolean) => http.patch<SecurityOverview>('/me/privacy', { shareWallet: on }),
};

export default identity;
