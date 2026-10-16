import rpcClient from './rpcClient.mjs';

const SUPPORTED = ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'wallet_switchEthereumChain', 'personal_sign', 'eth_sendTransaction', 'wallet_getCapabilities', 'wallet_sendCalls', 'wallet_getCallsStatus'];

// Puts a browser wallet into a Playwright page: window.ethereum plus an EIP-6963 announcement,
// as current extensions do. Signing happens in Node with the test wallet's key and transactions
// go to the local node as raw signed transactions; everything else the page asks is read from
// that node. A wallet with sendCalls (the smart wallet) offers atomic batches (EIP-5792).
// `decline` makes the next signing request fail the way a person pressing Reject would.
export default async function injectWallet(page, wallet, { rpcUrl, name = 'Live Test Wallet', announce = true } = {}) {
  const rpc = rpcClient(rpcUrl);
  const bundles = new Map();
  const control = { decline: false };

  await page.exposeFunction('__liveWallet', async (method, params = []) => {
    const chain = await rpc('eth_chainId');
    if (['personal_sign', 'eth_sendTransaction', 'wallet_sendCalls'].includes(method) && control.decline) {
      control.decline = false;
      return { error: { code: 4001, message: 'User rejected the request.' } };
    }
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return { result: [wallet.address] };
      case 'eth_chainId':
        return { result: chain };
      case 'wallet_switchEthereumChain':
        return BigInt(params[0]?.chainId) === BigInt(chain) ? { result: null } : { error: { code: 4902, message: 'Unrecognized chain.' } };
      case 'personal_sign':
        return { result: await wallet.signMessage(params[0]) };
      case 'eth_sendTransaction': {
        const tx = params[0];
        return { result: await wallet.send({ to: tx.to, data: tx.data ?? '0x', value: BigInt(tx.value ?? 0) }) };
      }
      case 'wallet_getCapabilities':
        return { result: { [chain]: { atomic: { status: wallet.sendCalls ? 'supported' : 'unsupported' } } } };
      case 'wallet_sendCalls': {
        if (!wallet.sendCalls) return { error: { code: 5700, message: 'Atomic batches are not supported.' } };
        const hash = await wallet.sendCalls(params[0].calls.map((c) => ({ to: c.to, data: c.data ?? '0x', value: BigInt(c.value ?? 0) })));
        // the transaction hash doubles as the bundle id
        bundles.set(hash, hash);
        return { result: { id: hash } };
      }
      case 'wallet_getCallsStatus': {
        const hash = bundles.get(params[0]);
        const receipt = hash && (await rpc('eth_getTransactionReceipt', [hash]));
        if (!receipt) return { result: { status: 100 } };
        return { result: { status: receipt.status === '0x1' ? 200 : 500, receipts: [{ transactionHash: hash, status: receipt.status }] } };
      }
      default:
        try {
          return { result: await rpc(method, params) };
        } catch (err) {
          return { error: { code: err.code ?? -32603, message: err.message } };
        }
    }
  });

  await page.addInitScript(({ name, announce, supported }) => {
    const listeners = new Map();
    const provider = {
      isLiveTestWallet: true,
      async request({ method, params }) {
        const { result, error } = await window.__liveWallet(method, params ?? []);
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return result;
      },
      on(event, fn) {
        listeners.set(fn, event);
        return provider;
      },
      removeListener(event, fn) {
        listeners.delete(fn);
        return provider;
      },
      supportedMethods: supported,
    };
    window.ethereum = provider;
    if (!announce) return;
    const info = { uuid: crypto.randomUUID(), name, rdns: 'dev.nil.live-test', icon: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2b6cb0"/></svg>')}` };
    const say = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
    window.addEventListener('eip6963:requestProvider', say);
    say();
  }, { name, announce, supported: SUPPORTED });

  return control;
}
