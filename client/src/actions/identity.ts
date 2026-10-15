import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import http from '../api/http';
import session from './session';
import ethereum from '../lib/ethereum';
import passkeyError from '../lib/passkeyError';
import type JoinDetails from '../types/JoinDetails';
import type SecurityOverview from '../types/SecurityOverview';

async function withPasskey<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw passkeyError(err);
  }
}

async function registerPasskey(body: Record<string, unknown>, label?: string) {
  const { challengeId, options } = await http.post<{ challengeId: string; options: any }>('/auth/passkey/register/options', body);
  const response = await withPasskey(() => startRegistration({ optionsJSON: options }));
  return http.post('/auth/passkey/register', { challengeId, response, label });
}

async function walletCeremony(body: Record<string, unknown>) {
  const { address, chainId } = await ethereum.account();
  const { challengeId, message } = await http.post<{ challengeId: string; message: string }>('/auth/wallet/challenge', { ...body, address, chainId });
  const signature = await ethereum.sign(message, address);
  return http.post('/auth/wallet/verify', { challengeId, signature });
}

// Passwordless ways in: passkeys for everyone, Ethereum wallets for web3 folks.
const identity = {
  async passkeyLogin() {
    const { challengeId, options } = await http.post<{ challengeId: string; options: any }>('/auth/passkey/login/options');
    const response = await withPasskey(() => startAuthentication({ optionsJSON: options }));
    await http.post('/auth/passkey/login', { challengeId, response });
    await session.enter();
  },

  async passkeyJoin(details: JoinDetails) {
    await registerPasskey({ ...details }, 'Passkey');
    if (details.mode === 'invite') history.replaceState(null, '', '/');
    await session.enter();
  },

  addPasskey: (label: string) => registerPasskey({ mode: 'add' }, label),

  async walletLogin() {
    await walletCeremony({ mode: 'login' });
    await session.enter();
  },

  async walletJoin(details: JoinDetails) {
    await walletCeremony({ ...details });
    if (details.mode === 'invite') history.replaceState(null, '', '/');
    await session.enter();
  },

  linkWallet: () => walletCeremony({ mode: 'add' }),

  overview: () => http.get<SecurityOverview>('/me/credentials'),
  rename: (id: string, label: string) => http.patch<SecurityOverview>(`/me/credentials/${id}`, { label }),
  remove: (id: string) => http.del<SecurityOverview>(`/me/credentials/${id}`),
  shareWallet: (on: boolean) => http.patch<SecurityOverview>('/me/privacy', { shareWallet: on }),
  setPassword: (input: { current?: string; email?: string; next: string }) => http.post('/me/password', input),
};

export default identity;
