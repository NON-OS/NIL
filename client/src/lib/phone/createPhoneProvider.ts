import phoneProtocol from './phoneProtocol';
import phoneFailure from './phoneFailure';
import rpcError from './rpcError';
import sessionAccounts from './sessionAccounts';
import type PhoneClient from '../../types/PhoneClient';
import type PhoneProvider from '../../types/PhoneProvider';
import type PhoneRequest from '../../types/PhoneRequest';

interface Options {
  client: PhoneClient;
  topic: string;
  // the network to start on, when the phone approved it
  chainId: number;
  timeoutMs?: number;
  // told when a request starts waiting for the phone; returns what to call once it settles
  watch?: (request: PhoneRequest) => () => void;
  // told once, when the phone ends the session or it runs out
  onEnd?: () => void;
}

interface SessionEvent {
  topic: string;
  params?: { event?: { name?: string; data?: unknown } };
}

const KIND: Record<string, PhoneRequest['kind']> = { personal_sign: 'sign', eth_sendTransaction: 'pay', wallet_switchEthereumChain: 'network' };
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const GONE = 'Your phone wallet disconnected. Connect it again to carry on.';
let nextId = 1;

function chainOf(data: unknown) {
  if (typeof data === 'number') return data;
  if (typeof data !== 'string') return NaN;
  const last = data.split(':').pop() ?? '';
  return /^0x[0-9a-f]+$/i.test(last) ? parseInt(last, 16) : Number(last);
}

// A phone wallet connected over WalletConnect, behind the same EIP-1193 interface as a browser
// wallet, so the rest of the app talks to it the way it talks to MetaMask. Accounts and the
// network come from what the phone approved; signing, sending and switching networks go to the
// phone; anything else is turned down with 4200, so the app takes the path it takes for any
// wallet without that feature (a batch, for one, falls back to one transaction at a time).
export default function createPhoneProvider({ client, topic, chainId, timeoutMs = phoneProtocol.requestSeconds * 1000, watch, onEnd }: Options): PhoneProvider {
  const waiting = new Set<(err: Error) => void>();
  let closed: string | null = null;
  let preferred: string | null = null;

  const session = () => {
    try {
      return client.session.get(topic);
    } catch {
      return null;
    }
  };
  const accounts = () => sessionAccounts(session());
  const chains = () => [...new Set(accounts().map((a) => a.chainId))];
  const allows = (method: string) => Boolean(session()?.namespaces.eip155?.methods?.includes(method));
  let chain = chains().includes(chainId) ? chainId : (chains()[0] ?? chainId);

  const address = () => {
    const here = accounts().filter((a) => a.chainId === chain);
    return here.find((a) => preferred && same(a.address, preferred))?.address ?? here[0]?.address ?? null;
  };
  const owns = (who: unknown) => accounts().some((a) => same(who, a.address));

  async function ask(method: string, params: unknown) {
    if (!allows(method)) throw rpcError(4200, 'Your phone wallet didn’t allow Nil to ask for this. Disconnect it and connect again.');
    let stop!: (err: Error) => void;
    const stopped = new Promise<never>((_, reject) => (stop = reject));
    waiting.add(stop);
    const minutes = Math.round(timeoutMs / 60_000);
    const timer = setTimeout(() => stop(new Error(`Your phone didn’t answer within ${minutes > 1 ? `${minutes} minutes` : 'the time allowed'}, so Nil stopped waiting. Try again.`)), timeoutMs);
    const done = watch?.({ id: nextId++, kind: KIND[method], until: Date.now() + timeoutMs, cancel: () => stop(new Error('Cancelled here. If your phone still shows the request, reject it there.')) });
    try {
      // the phone drops the request when Nil stops waiting, never before WalletConnect's minimum
      const expiry = Math.max(phoneProtocol.requestSeconds, Math.ceil(timeoutMs / 1000));
      return await Promise.race([client.request({ topic, chainId: `eip155:${chain}`, request: { method, params }, expiry }), stopped]);
    } catch (err) {
      throw phoneFailure(err);
    } finally {
      clearTimeout(timer);
      waiting.delete(stop);
      done?.();
    }
  }

  async function switchChain(params: unknown) {
    const asked = (params as { chainId?: unknown }[] | undefined)?.[0]?.chainId;
    const target = typeof asked === 'string' && /^0x[0-9a-f]{1,12}$/i.test(asked) ? parseInt(asked, 16) : NaN;
    if (!(target > 0)) throw rpcError(-32602, 'That isn’t a network id.');
    // each WalletConnect request names its network, so moving between networks the phone
    // already approved needs nothing from it
    if (!chains().includes(target)) {
      if (allows('wallet_switchEthereumChain')) await ask('wallet_switchEthereumChain', params);
      if (!chains().includes(target)) throw rpcError(4902, `Your phone wallet hasn’t approved network ${target} for Nil. Switch to it in the wallet app, then connect again.`);
    }
    chain = target;
    return null;
  }

  async function request({ method, params }: { method: string; params?: unknown[] }) {
    if (closed) throw rpcError(4900, closed);
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts': {
        const current = address();
        if (!current) throw rpcError(4100, 'Your phone wallet didn’t share an account for this network.');
        return [current];
      }
      case 'eth_chainId':
        return `0x${chain.toString(16)}`;
      case 'wallet_switchEthereumChain':
        return switchChain(params);
      case 'personal_sign':
        if (!owns(params?.[1])) throw rpcError(4100, 'That address isn’t the one connected on your phone.');
        return ask(method, params);
      case 'eth_sendTransaction':
        if (!owns((params?.[0] as { from?: unknown } | undefined)?.from)) throw rpcError(4100, 'That address isn’t the one connected on your phone.');
        return ask(method, params);
      default:
        throw rpcError(4200, `${method} isn’t available from a phone wallet.`);
    }
  }

  const onEvent = ({ topic: t, params }: SessionEvent) => {
    if (t !== topic) return;
    const { name, data } = params?.event ?? {};
    if (name === 'chainChanged' && chains().includes(chainOf(data))) chain = chainOf(data);
    if (name === 'accountsChanged' && Array.isArray(data) && typeof data[0] === 'string') preferred = data[0].split(':').pop() ?? null;
  };
  const onGone = ({ topic: t }: { topic: string }) => {
    if (t !== topic || closed) return;
    close(GONE);
    onEnd?.();
  };

  function close(reason = GONE) {
    if (closed) return;
    closed = reason;
    client.off('session_event', onEvent);
    client.off('session_delete', onGone);
    client.off('session_expire', onGone);
    for (const stop of [...waiting]) stop(rpcError(4900, reason));
  }

  client.on('session_event', onEvent);
  client.on('session_delete', onGone);
  client.on('session_expire', onGone);
  return { request, address, chainId: () => chain, close };
}
