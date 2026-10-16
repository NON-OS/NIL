import http from 'node:http';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const word = (n) => pad((BigInt(n) < 0n ? (1n << 256n) + BigInt(n) : BigInt(n)).toString(16));
const selector = (signature) => `0x${bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8)}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// the Zero-State Pass contract: it holds no NOX balances, so only explicit ZSP balances answer for it
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
// keccak256("Announcement(uint256,address,address,bytes,bytes)"), the ERC-5564 event
const ANNOUNCEMENT_TOPIC = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';
const OBSERVE = selector('observe(uint32[])');
const TOKEN0 = selector('token0()');
const TOKEN1 = selector('token1()');
const LATEST_ROUND = selector('latestRoundData()');
const DECIMALS = selector('decimals()');
const hex = (n) => `0x${n.toString(16)}`;

// A tiny fake Ethereum JSON-RPC node: balances, transaction receipts, blocks with hashes and
// times, a finalized tag, logs, reorgs, and the Uniswap pool and Chainlink feed reads that
// price NOX. Everything is under the test's control.
export default function mockChain() {
  const balances = new Map();
  const tokenBalances = new Map();
  const stakes = new Map();
  const ethBalances = new Map();
  const nonces = new Map();
  // hash -> { status, blockNumber, logs: [{ address, topics, data }] }
  const receipts = new Map();
  const forks = new Map();
  const times = new Map();
  const pools = new Map();
  const feeds = new Map();
  const failing = new Set();
  const calls = [];
  const sent = [];
  const genesis = Math.floor(Date.now() / 1000);
  let block = 1000;
  let chainId = 1;
  // how far the finalized block trails the head; null makes the node refuse the tag
  let finalityLag = 2;

  const blockHash = (n) => `0x${pad(`${(forks.get(n) ?? 0).toString(16)}b10c${n.toString(16)}`)}`;
  const blockTime = (n) => times.get(n) ?? genesis + (n - 1000) * 12;
  const receiptOut = (hash, r) => ({
    transactionHash: hash,
    status: r.status,
    blockNumber: hex(r.blockNumber),
    blockHash: blockHash(r.blockNumber),
    logs: r.logs.map((log, i) => ({ ...log, logIndex: hex(i), blockNumber: hex(r.blockNumber), blockHash: blockHash(r.blockNumber), transactionHash: hash, removed: false })),
  });

  function call(to, data) {
    const contract = to?.toLowerCase();
    const holder = `0x${data.slice(-40)}`;
    if (failing.has(contract)) throw new Error('reverted');
    const pool = pools.get(contract);
    if (pool) {
      if (pool.fail) throw new Error('OLD');
      if (data === TOKEN0) return `0x${pad(pool.token0)}`;
      if (data === TOKEN1) return `0x${pad(pool.token1)}`;
      if (data.startsWith(OBSERVE)) {
        const seconds = BigInt(`0x${data.slice(2 + 8 + 64 * 2, 2 + 8 + 64 * 3)}`);
        const now = 10n ** 9n;
        return `0x${word(64)}${word(64 + 32 * 3)}${word(2)}${word(BigInt(pool.tick) * (now - seconds))}${word(BigInt(pool.tick) * now)}${word(2)}${word(0)}${word(0)}`;
      }
    }
    const feed = feeds.get(contract);
    if (feed) {
      if (data === DECIMALS) return `0x${word(feed.decimals)}`;
      if (data === LATEST_ROUND) return `0x${word(1)}${word(feed.answer)}${word(feed.updatedAt)}${word(feed.updatedAt)}${word(1)}`;
    }
    if (data.startsWith('0x70a08231') && tokenBalances.has(`${contract}:${holder}`)) return `0x${pad(tokenBalances.get(`${contract}:${holder}`).toString(16))}`;
    if (data.startsWith('0x70a08231') && contract === ZSP) return `0x${pad('0')}`;
    if (data.startsWith('0x70a08231')) return `0x${pad((balances.get(holder) ?? 0n).toString(16))}`;
    // getStakeInfo(address): staked amount first, six more words after it
    if (data.startsWith('0xc3453153')) return `0x${pad((stakes.get(holder) ?? 0n).toString(16))}${pad('0').repeat(6)}`;
    if (data === DECIMALS) return `0x${pad('12')}`;
    return '0x';
  }

  function logs({ address, topics = [], fromBlock, toBlock }) {
    const from = Number(fromBlock);
    const to = toBlock === 'latest' ? block : Number(toBlock);
    const out = [];
    for (const [hash, r] of receipts) {
      if (r.status !== '0x1' || r.blockNumber < from || r.blockNumber > to || r.blockNumber > block) continue;
      receiptOut(hash, r).logs.forEach((log) => {
        if (address && log.address.toLowerCase() !== address.toLowerCase()) return;
        if (topics.some((t, i) => t !== null && t !== undefined && log.topics[i]?.toLowerCase() !== t.toLowerCase())) return;
        out.push(log);
      });
    }
    return out;
  }

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { id, method, params } = JSON.parse(raw);
      calls.push(method);
      let result = null;
      let error = null;
      try {
        if (method === 'eth_chainId') result = hex(chainId);
        else if (method === 'eth_blockNumber') result = hex(block);
        else if (method === 'eth_call') result = call(params[0].to, params[0].data);
        else if (method === 'eth_getTransactionReceipt') {
          const r = receipts.get(params[0].toLowerCase());
          result = r && r.blockNumber <= block ? receiptOut(params[0].toLowerCase(), r) : null;
        } else if (method === 'eth_getLogs') result = logs(params[0]);
        else if (method === 'eth_getBalance') result = hex(ethBalances.get(params[0].toLowerCase()) ?? 0n);
        else if (method === 'eth_getTransactionCount') result = hex(nonces.get(params[0].toLowerCase()) ?? 0);
        else if (method === 'eth_estimateGas') result = params[0].data && params[0].data !== '0x' ? '0xea60' : '0x5208';
        else if (method === 'eth_getBlockByNumber') {
          const tag = params[0];
          if (tag === 'finalized' && finalityLag === null) throw new Error('unknown block tag finalized');
          const n = tag === 'latest' ? block : tag === 'finalized' ? block - finalityLag : Number(tag);
          result = n <= block ? { number: hex(n), hash: blockHash(n), timestamp: hex(blockTime(n)), baseFeePerGas: '0x3b9aca00' } : null;
        } else if (method === 'eth_maxPriorityFeePerGas') result = '0x5f5e100';
        else if (method === 'eth_sendRawTransaction') {
          sent.push(params[0]);
          result = `0x${sent.length.toString(16).padStart(64, 'f')}`;
        }
      } catch (err) {
        error = { code: 3, message: err.message };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }));
    });
  });

  const transferLog = ({ token, from, to, value }) => ({ address: token, topics: [TRANSFER_TOPIC, `0x${pad(from)}`, `0x${pad(to)}`], data: `0x${pad(BigInt(value).toString(16))}` });

  return {
    server,
    setBalance: (address, wei) => balances.set(address.toLowerCase(), BigInt(wei)),
    setEthBalance: (address, wei) => ethBalances.set(address.toLowerCase(), BigInt(wei)),
    // a balance in one specific token contract (ZSPs, for instance), separate from NOX
    setTokenBalance: (token, address, amount) => tokenBalances.set(`${token.toLowerCase()}:${address.toLowerCase()}`, BigInt(amount)),
    setStake: (address, wei) => stakes.set(address.toLowerCase(), BigInt(wei)),
    sent,
    calls,
    setChainId: (id) => (chainId = id),
    mine: (blocks) => (block += blocks),
    head: () => block,
    // null: the node doesn't know the `finalized` tag
    setFinalityLag: (lag) => (finalityLag = lag),
    setBlockTime: (n, seconds) => times.set(n, seconds),
    blockTime,
    // a Uniswap V3 pool whose time-weighted average tick is `tick`
    setPool: (address, { token0, token1, tick, fail = false }) => pools.set(address.toLowerCase(), { token0: token0.toLowerCase(), token1: token1.toLowerCase(), tick, fail }),
    // a Chainlink feed answering `answer` with `decimals`, last updated at `updatedAt` (seconds)
    setFeed: (address, { answer, decimals = 8, updatedAt = Math.floor(Date.now() / 1000) }) => feeds.set(address.toLowerCase(), { answer: BigInt(answer), decimals, updatedAt }),
    // every call to this contract reverts
    breakContract: (address) => failing.add(address.toLowerCase()),
    fixContract: (address) => failing.delete(address.toLowerCase()),
    // Records a mined ERC-20 Transfer, `depth` blocks below the current head (1 = the head).
    addTransfer({ hash, token, from, to, value, status = '0x1', depth = 6 }) {
      receipts.set(hash.toLowerCase(), { status, blockNumber: block - depth + 1, logs: [transferLog({ token, from, to, value })] });
    },
    // One transaction with several transfers in it.
    addTransfers({ hash, transfers, status = '0x1', depth = 6 }) {
      receipts.set(hash.toLowerCase(), { status, blockNumber: block - depth + 1, logs: transfers.map(transferLog) });
    },
    // A transaction mined in the future: invisible until the head reaches `atBlock`.
    addTransferAt({ hash, token, from, to, value, atBlock }) {
      receipts.set(hash.toLowerCase(), { status: '0x1', blockNumber: atBlock, logs: [transferLog({ token, from, to, value })] });
    },
    // A reorg: the block at this height is replaced, so everything in it gets a new block hash;
    // `moveTo` re-mines one transaction at another height.
    reorg(height, { moveTo = null, hash = null } = {}) {
      forks.set(height, (forks.get(height) ?? 0) + 1);
      if (hash && moveTo !== null) receipts.get(hash.toLowerCase()).blockNumber = moveTo;
    },
    // A reorg that drops a transaction from the chain altogether.
    drop: (hash) => receipts.delete(hash.toLowerCase()),
    blockOf: (hash) => receipts.get(hash.toLowerCase())?.blockNumber ?? null,
    // Records a mined ERC-5564 announcement: Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata).
    addAnnouncement({ hash, announcer, stealthAddress, caller, ephemeralPublicKey, metadata, schemeId = 1, depth = 6 }) {
      const dyn = (body0) => {
        const body = body0.replace(/^0x/, '');
        return pad((body.length / 2).toString(16)) + body.padEnd(Math.ceil(body.length / 64) * 64, '0');
      };
      const first = dyn(ephemeralPublicKey);
      const data = `0x${pad('40')}${pad((64 + first.length / 2).toString(16))}${first}${dyn(metadata)}`;
      receipts.set(hash.toLowerCase(), {
        status: '0x1',
        blockNumber: block - depth + 1,
        logs: [{ address: announcer, topics: [ANNOUNCEMENT_TOPIC, `0x${pad(schemeId.toString(16))}`, `0x${pad(stealthAddress)}`, `0x${pad(caller)}`], data }],
      });
    },
  };
}
