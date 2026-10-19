import rpcError from './rpcError';

// WalletConnect's codes for a person saying no on their phone, next to the usual EIP-1193 one.
const DECLINED = new Set([4001, 5000, 5001, 5002]);

// What a phone wallet or the relay sent back when a request failed, as an error the app's usual
// wallet messages understand. A declined request gets the code a browser wallet would use.
export default function phoneFailure(err: unknown): Error {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && DECLINED.has(code)) return rpcError(4001, 'You declined the request on your phone.');
  if (err instanceof Error) return err;
  const message = (err as { message?: unknown } | null)?.message;
  return rpcError(typeof code === 'number' ? code : -32603, typeof message === 'string' && message ? message.slice(0, 200) : 'Your phone wallet returned an error.');
}
