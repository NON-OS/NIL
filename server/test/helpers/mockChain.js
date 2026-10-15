import http from 'node:http';

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// keccak256("Announcement(uint256,address,address,bytes,bytes)"), the ERC-5564 event
const ANNOUNCEMENT_TOPIC = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';

// A tiny fake Ethereum JSON-RPC node: token balances and transaction receipts you control.
export default function mockChain() {
  const balances = new Map();
  const ethBalances = new Map();
  const nonces = new Map();
  const receipts = new Map();
  const sent = [];
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
      else if (method === 'eth_getBalance') result = `0x${(ethBalances.get(params[0].toLowerCase()) ?? 0n).toString(16)}`;
      else if (method === 'eth_getTransactionCount') result = `0x${(nonces.get(params[0].toLowerCase()) ?? 0).toString(16)}`;
      else if (method === 'eth_estimateGas') result = params[0].data && params[0].data !== '0x' ? '0xea60' : '0x5208';
      else if (method === 'eth_getBlockByNumber') result = { number: `0x${block.toString(16)}`, baseFeePerGas: '0x3b9aca00' };
      else if (method === 'eth_maxPriorityFeePerGas') result = '0x5f5e100';
      else if (method === 'eth_sendRawTransaction') {
        sent.push(params[0]);
        result = `0x${sent.length.toString(16).padStart(64, 'f')}`;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });

  return {
    server,
    setBalance: (address, wei) => balances.set(address.toLowerCase(), BigInt(wei)),
    setEthBalance: (address, wei) => ethBalances.set(address.toLowerCase(), BigInt(wei)),
    sent,
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
    // Records a mined ERC-5564 announcement: Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata).
    addAnnouncement({ hash, announcer, stealthAddress, caller, ephemeralPublicKey, metadata, schemeId = 1, depth = 6 }) {
      const dyn = (hex) => {
        const body = hex.replace(/^0x/, '');
        return pad((body.length / 2).toString(16)) + body.padEnd(Math.ceil(body.length / 64) * 64, '0');
      };
      const first = dyn(ephemeralPublicKey);
      const data = `0x${pad('40')}${pad((64 + first.length / 2).toString(16))}${first}${dyn(metadata)}`;
      receipts.set(hash.toLowerCase(), {
        transactionHash: hash,
        status: '0x1',
        blockNumber: `0x${(block - depth + 1).toString(16)}`,
        logs: [{ address: announcer, topics: [ANNOUNCEMENT_TOPIC, `0x${pad(schemeId.toString(16))}`, `0x${pad(stealthAddress)}`, `0x${pad(caller)}`], data }],
      });
    },
  };
}
