import http from 'node:http';

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// A tiny fake Ethereum JSON-RPC node: token balances and transaction receipts you control.
export default function mockChain() {
  const balances = new Map();
  const receipts = new Map();
  let block = 1000;
  let chainId = 1;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { id, method, params } = JSON.parse(raw);
      let result = null;
      if (method === 'eth_chainId') result = `0x${chainId.toString(16)}`;
      else if (method === 'eth_blockNumber') result = `0x${block.toString(16)}`;
      else if (method === 'eth_call') {
        const data = params[0].data;
        if (data.startsWith('0x70a08231')) result = `0x${pad((balances.get(`0x${data.slice(-40)}`) ?? 0n).toString(16))}`;
        else if (data === '0x313ce567') result = `0x${pad('12')}`;
        else result = '0x';
      } else if (method === 'eth_getTransactionReceipt') result = receipts.get(params[0].toLowerCase()) ?? null;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });

  return {
    server,
    setBalance: (address, wei) => balances.set(address.toLowerCase(), BigInt(wei)),
    setChainId: (id) => (chainId = id),
    mine: (blocks) => (block += blocks),
    // Records a mined ERC-20 Transfer, `depth` blocks below the current head.
    addTransfer({ hash, token, from, to, value, status = '0x1', depth = 6 }) {
      receipts.set(hash.toLowerCase(), {
        transactionHash: hash,
        status,
        blockNumber: `0x${(block - depth + 1).toString(16)}`,
        logs: [{ address: token, topics: [TRANSFER_TOPIC, `0x${pad(from)}`, `0x${pad(to)}`], data: `0x${pad(BigInt(value).toString(16))}` }],
      });
    },
  };
}
