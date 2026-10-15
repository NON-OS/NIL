interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}

const provider = (): Provider | null => (window as unknown as { ethereum?: Provider }).ethereum ?? null;

function friendly(err: any): Error {
  if (err?.code === 4001) return new Error('You declined the request in your wallet.');
  if (err?.code === -32002) return new Error('Your wallet already has a request waiting. Open it to continue.');
  return new Error(err?.message || 'Your wallet returned an error.');
}

// Talks to an injected EIP-1193 wallet (MetaMask, Rabby, Coinbase Wallet, Brave…).
// Nothing here can move funds: we only ask for an address and a text signature.
const ethereum = {
  available: () => provider() !== null,

  async account(): Promise<{ address: string; chainId: number }> {
    const p = provider();
    if (!p) throw new Error('No wallet found. Install a wallet extension like MetaMask or Rabby, or open NONOS in your wallet’s browser.');
    try {
      const [address] = await p.request({ method: 'eth_requestAccounts' });
      const chainId = parseInt(await p.request({ method: 'eth_chainId' }), 16) || 1;
      return { address, chainId };
    } catch (err) {
      throw friendly(err);
    }
  },

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
