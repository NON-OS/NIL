import wallets from './wallets';
import phoneWallet from './phone/phoneWallet';
import type Eip1193Provider from '../types/Eip1193Provider';

const provider = (): Eip1193Provider | null => wallets.active()?.provider ?? null;

function friendly(err: any): Error {
  if (err?.code === 4001) return new Error('You declined the request in your wallet.');
  if (err?.code === -32002) return new Error('Your wallet already has a request waiting. Open it to continue.');
  return new Error(err?.message || 'Your wallet returned an error.');
}

// Talks to the browser wallet picked on this device (see wallets.ts): MetaMask, Rabby, Coinbase
// Wallet, Brave, a wallet app's own browser. Signing in only asks for an address and a text
// signature. Paying a bounty sends a transaction, which the wallet always shows its owner first.
const ethereum = {
  available: () => provider() !== null,

  async account(): Promise<{ address: string; chainId: number }> {
    // with no wallet in this browser, a wallet app on the phone where the server allows it
    const p = provider() ?? (await phoneWallet.offer());
    if (!p) throw new Error('No wallet found on this device. Add one to your browser, or open Nil in your wallet app.');
    try {
      const [address] = await p.request({ method: 'eth_requestAccounts' });
      const chainId = parseInt(await p.request({ method: 'eth_chainId' }), 16) || 1;
      return { address, chainId };
    } catch (err) {
      throw friendly(err);
    }
  },

  // Asks the wallet to move to the network NOX lives on before sending anything.
  async useChain(chainId: number) {
    const p = provider();
    if (!p) throw new Error('No wallet found.');
    const current = parseInt(await p.request({ method: 'eth_chainId' }), 16);
    if (current === chainId) return;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
    } catch (err) {
      throw friendly(err);
    }
  },

  async send(tx: { from: string; to: string; data: string; value?: bigint }): Promise<string> {
    try {
      return await provider()!.request({ method: 'eth_sendTransaction', params: [{ from: tx.from, to: tx.to, data: tx.data, value: `0x${(tx.value ?? 0n).toString(16)}` }] });
    } catch (err) {
      throw friendly(err);
    }
  },

  // Sends several calls as one atomic transaction where the wallet supports it (EIP-5792), so a
  // private payout and its announcement land together or not at all. Returns null when the
  // wallet can't batch; the caller then sends the calls one by one.
  async batch(from: string, chainId: number, calls: { to: string; data: string; value?: bigint }[]): Promise<string | null> {
    const p = provider();
    const chain = `0x${chainId.toString(16)}`;
    try {
      const caps = await p!.request({ method: 'wallet_getCapabilities', params: [from, [chain]] });
      if (!['supported', 'ready'].includes(caps?.[chain]?.atomic?.status)) return null;
    } catch {
      return null;
    }
    try {
      const sent = await p!.request({
        method: 'wallet_sendCalls',
        params: [{ version: '2.0.0', chainId: chain, from, atomicRequired: true, calls: calls.map((c) => ({ to: c.to, data: c.data, value: `0x${(c.value ?? 0n).toString(16)}` })) }],
      });
      const id = typeof sent === 'string' ? sent : sent?.id;
      // the wallet reports the bundle's status; wait for it to land (or fail) for up to ten minutes
      for (let i = 0; i < 300; i++) {
        const status = await p!.request({ method: 'wallet_getCallsStatus', params: [id] });
        if (status?.status === 200 && status.receipts?.[0]?.transactionHash) return status.receipts[0].transactionHash;
        if (status?.status >= 400) throw new Error('Your wallet couldn’t complete the payment, so nothing was sent.');
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('Your wallet is still working on the payment. Check it, then paste the transaction here.');
    } catch (err) {
      throw err instanceof Error && !(err as any).code ? err : friendly(err);
    }
  },

  // For key messages this browser builds itself. Text the server wrote goes through
  // signServerText, which refuses anything that could be a key message.
  async sign(message: string, address: string): Promise<string> {
    const hex = `0x${[...new TextEncoder().encode(message)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    try {
      return await provider()!.request({ method: 'personal_sign', params: [hex, address] });
    } catch (err) {
      throw friendly(err);
    }
  },
};

export default ethereum;
