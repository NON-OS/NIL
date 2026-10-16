import http from 'node:http';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import sigValidatorCode from '../../chain/sigValidatorCode.js';

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// keccak256("Announcement(uint256,address,address,bytes,bytes)"), the ERC-5564 event
// the Zero-State Pass contract: it holds no NOX balances, so only explicit ZSP balances answer for it
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
const ANNOUNCEMENT_TOPIC = '0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7';
const ACCEPTED = `0x1626ba7e${'0'.repeat(56)}`;
const REJECTED = `0xffffffff${'0'.repeat(56)}`;
const COUNTERFACTUAL = '6492'.repeat(16);
const REVERTED = { code: 3, message: 'execution reverted' };

// The `bytes` value whose offset sits in head word `i` of ABI-encoded `body` (hex, no 0x).
function bytesAt(body, i) {
  const at = Number(BigInt(`0x${body.slice(i * 64, i * 64 + 64)}`)) * 2;
  const length = Number(BigInt(`0x${body.slice(at, at + 64)}`)) * 2;
  return body.slice(at + 64, at + 64 + length);
}

// The fake smart wallets in helpers/smartWallet.js sign with one owner key: an owner index
// byte, then a plain 65-byte signature over the digest they're asked about.
function ownerSigned(wallet, hash, sig) {
  try {
    const raw = hexToBytes(sig.slice(2));
    const point = secp256k1.Signature.fromCompact(raw.slice(0, 64)).addRecoveryBit(raw[64] - 27).recoverPublicKey(hexToBytes(hash));
    return sig.startsWith('00') && `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}` === wallet.owner;
  } catch {
    return false;
  }
}

// A tiny fake Ethereum JSON-RPC node: token balances and transaction receipts you control.
export default function mockChain() {
  const balances = new Map();
  const tokenBalances = new Map();
  const stakes = new Map();
  const ethBalances = new Map();
  const nonces = new Map();
  const receipts = new Map();
  const smartWallets = new Map();
  const sent = [];
  // every call the server made, in order, so tests can check what the node got to see and when
  const calls = [];
  let callDelayMs = 0;
  let block = 1000;
  let chainId = 1;

  // isValidSignature(bytes32, bytes) on a deployed wallet (EIP-1271)
  function isValidSignature(wallet, data) {
    const body = data.slice(10);
    return ownerSigned(wallet, body.slice(0, 64), bytesAt(body, 1)) ? ACCEPTED : REJECTED;
  }

  // The EIP-6492 validator run as a deployless eth_call: it deploys a counterfactual wallet with
  // the factory call in the signature, then asks it. A factory call that doesn't produce the
  // signer reverts, as it would on a real node.
  function validate(data) {
    const body = data.slice(2 + sigValidatorCode.length);
    const signer = `0x${body.slice(24, 64)}`;
    const hash = body.slice(64, 128);
    const sig = bytesAt(body, 2);
    const wallet = smartWallets.get(signer);
    if (!wallet || !sig.endsWith(COUNTERFACTUAL)) return { error: REVERTED };
    const wrapped = sig.slice(0, -64);
    const factory = `0x${wrapped.slice(24, 64)}`;
    if (!wallet.deployed && (factory !== wallet.factory || `0x${bytesAt(wrapped, 1)}` !== wallet.factoryData)) return { error: REVERTED };
    return { result: ownerSigned(wallet, hash, bytesAt(wrapped, 2)) ? '0x01' : '0x00' };
  }

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const { id, method, params } = JSON.parse(raw);
      calls.push({ method, params, at: Date.now() });
      let result = null;
      let error;
      const wallet = method === 'eth_call' && params[0].to ? smartWallets.get(params[0].to.toLowerCase()) : null;
      if (method === 'eth_call' && callDelayMs) await new Promise((r) => setTimeout(r, callDelayMs));
      if (method === 'eth_call' && !params[0].to && params[0].data?.startsWith(`0x${sigValidatorCode}`)) ({ result = null, error } = validate(params[0].data));
      else if (wallet) result = wallet.deployed && params[0].data.startsWith('0x1626ba7e') ? isValidSignature(wallet, params[0].data) : '0x';
      else if (method === 'eth_getCode') result = smartWallets.get(params[0].toLowerCase())?.deployed ? '0x6080' : '0x';
      else if (method === 'eth_chainId') result = `0x${chainId.toString(16)}`;
      else if (method === 'eth_blockNumber') result = `0x${block.toString(16)}`;
      else if (method === 'eth_call') {
        const data = params[0].data;
        const holder = `0x${data.slice(-40)}`;
        const contract = params[0].to?.toLowerCase();
        if (data.startsWith('0x70a08231') && tokenBalances.has(`${contract}:${holder}`)) result = `0x${pad(tokenBalances.get(`${contract}:${holder}`).toString(16))}`;
        else if (data.startsWith('0x70a08231') && contract === ZSP) result = `0x${pad('0')}`;
        else if (data.startsWith('0x70a08231')) result = `0x${pad((balances.get(holder) ?? 0n).toString(16))}`;
        // getStakeInfo(address): staked amount first, six more words after it
        else if (data.startsWith('0xc3453153')) result = `0x${pad((stakes.get(holder) ?? 0n).toString(16))}${pad('0').repeat(6)}`;
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
      if (res.destroyed) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }));
    });
  });

  return {
    server,
    // every JSON-RPC method asked for, in order
    calls,
    // holds every eth_call back this long, like a slow or overloaded node
    setCallDelay: (ms) => (callDelayMs = ms),
    // a smart-contract wallet from helpers/smartWallet.js, deployed or only counterfactual;
    // deploying it later also changes how the helper signs
    addSmartWallet: (w) => smartWallets.set(w.address, w),
    deploy: (address) => (smartWallets.get(address.toLowerCase()).deployed = true),
    setBalance: (address, wei) => balances.set(address.toLowerCase(), BigInt(wei)),
    setEthBalance: (address, wei) => ethBalances.set(address.toLowerCase(), BigInt(wei)),
    // a balance in one specific token contract (ZSPs, for instance), separate from NOX
    setTokenBalance: (token, address, amount) => tokenBalances.set(`${token.toLowerCase()}:${address.toLowerCase()}`, BigInt(amount)),
    setStake: (address, wei) => stakes.set(address.toLowerCase(), BigInt(wei)),
    sent,
    calls,
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
