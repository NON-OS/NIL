// WalletConnect turns down requests that expire sooner than five minutes, and the sign-up
// message lasts five minutes too, so the phone gets that long to answer
const REQUEST_SECONDS = 300;
// WalletConnect's codes for a person saying no on their phone, next to the usual EIP-1193 one
const DECLINED = new Set([4001, 5000, 5001, 5002]);

const rpcError = (code, message) => Object.assign(new Error(message), { code });
const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

// The phone as the wallet for one sign-up, behind the calls the page makes of a browser wallet:
// the account and network are what the phone approved, and the one signature goes to the phone.
// Saying no on the phone reads like saying no in a browser wallet. `stop` ends a request still
// waiting, when the person closes the dialog or the phone goes away.
export default function phoneProvider({ client, topic, chainId, address }) {
  let stopWaiting = null;

  async function sign(params) {
    if (!same(params?.[1], address)) throw rpcError(4100, 'That address isn’t the one connected on your phone.');
    const stopped = new Promise((_, reject) => (stopWaiting = reject));
    const timer = setTimeout(() => stopWaiting(new Error('Your phone didn’t answer within 5 minutes, so Nil stopped waiting. Try again.')), REQUEST_SECONDS * 1000);
    try {
      const asked = client.request({ topic, chainId: `eip155:${chainId}`, request: { method: 'personal_sign', params }, expiry: REQUEST_SECONDS });
      return await Promise.race([asked, stopped]);
    } catch (err) {
      if (DECLINED.has(err?.code)) throw rpcError(4001, 'You declined the request on your phone.');
      throw err instanceof Error ? err : rpcError(-32603, 'Your phone wallet returned an error.');
    } finally {
      clearTimeout(timer);
      stopWaiting = null;
    }
  }

  return {
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
      if (method === 'personal_sign') return sign(params);
      throw rpcError(4200, `${method} isn’t available from a phone wallet.`);
    },
    stop(message) {
      stopWaiting?.(rpcError(4900, message));
    },
  };
}
