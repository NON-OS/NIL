import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import calls from './calls.mjs';
import mainnet from './mainnet.mjs';
import messageDigest from './messageDigest.mjs';

const { selector, word } = calls;
const MAGIC = '6492'.repeat(16);
const keccakHex = (hex) => bytesToHex(keccak_256(hexToBytes(hex)));
const keccakText = (text) => bytesToHex(keccak_256(utf8ToBytes(text)));
const padded = (hex) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
const bytesArg = (hex) => `${word((hex.length / 2).toString(16))}${padded(hex)}`;

// createAccount / getAddress arguments: one owner, an EOA, as abi.encode(address), and a nonce
const ownersArg = (owner, nonce) => `${word('40')}${word(nonce)}${word('1')}${word('20')}${word('20')}${word(owner)}`;

function executeCall(to, value, data) {
  const body = data.replace(/^0x/, '');
  return `0x${selector('execute(address,uint256,bytes)')}${word(to)}${word(value)}${word('60')}${bytesArg(body)}`;
}

function executeBatchCall(list) {
  const tuples = list.map(({ to, value = 0n, data = '0x' }) => `${word(to)}${word(value)}${word('60')}${bytesArg(data.replace(/^0x/, ''))}`);
  let offset = tuples.length * 32;
  const heads = tuples.map((t) => {
    const at = word(offset.toString(16));
    offset += t.length / 2;
    return at;
  });
  return `0x${selector('executeBatch((address,uint256,bytes)[])')}${word('20')}${word(list.length)}${heads.join('')}${tuples.join('')}`;
}

// A Coinbase Smart Wallet owned by a test wallet's key, made by the real factory on the chain.
// Until deploy() it exists only as an address, and its signatures carry the factory call
// (EIP-6492), as passkey wallets do before their first transaction. Once deployed, signatures
// are checked by the wallet itself (EIP-1271). Transactions go through execute(), sent by the
// owner, so tokens move from the smart wallet's own address.
export default async function coinbaseWallet(rpc, owner, { nonce = 0n } = {}) {
  const factory = mainnet.coinbaseWalletFactory;
  const chainId = BigInt(await rpc('eth_chainId'));
  const args = ownersArg(owner.address, nonce);
  const factoryCall = `0x${selector('createAccount(bytes[],uint256)')}${args}`;
  const address = `0x${(await rpc('eth_call', [{ to: factory, data: `0x${selector('getAddress(bytes[],uint256)')}${args}` }, 'latest'])).slice(-40)}`;
  const deployed = async () => (await rpc('eth_getCode', [address, 'latest'])) !== '0x';

  // the wallet checks the owner's signature over replaySafeHash(digest), an EIP-712 wrap bound
  // to this chain and this account, then wraps it as SignatureWrapper(ownerIndex, signature)
  function innerSignature(digest) {
    const domain = keccakHex(keccakText('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)') + keccakText('Coinbase Smart Wallet') + keccakText('1') + word(chainId) + word(address));
    const struct = keccakHex(keccakText('CoinbaseSmartWalletMessage(bytes32 hash)') + bytesToHex(digest));
    const sig = secp256k1.sign(hexToBytes(keccakHex(`1901${domain}${struct}`)), owner.key);
    const ecdsa = `${word(sig.r)}${word(sig.s)}${(sig.recovery + 27).toString(16)}`;
    return `${word('20')}${word('0')}${word('40')}${bytesArg(ecdsa)}`;
  }

  function counterfactual(inner) {
    const call = factoryCall.slice(2);
    const second = 96 + 32 + padded(call).length / 2;
    return `${word(factory)}${word('60')}${word(second.toString(16))}${bytesArg(call)}${bytesArg(inner)}${MAGIC}`;
  }

  const wallet = {
    address,
    owner,
    factoryCall,
    deployed,
    async signMessage(message) {
      const inner = innerSignature(messageDigest(message));
      return `0x${(await deployed()) ? inner : counterfactual(inner)}`;
    },
    deploy: () => owner.send({ to: factory, data: factoryCall }),
    async send({ to, data = '0x', value = 0n }) {
      if (!(await deployed())) throw new Error('Deploy the smart wallet before sending from it.');
      return owner.send({ to: address, data: executeCall(to, value, data) });
    },
    // several calls in one transaction that all land or none do (what EIP-5792 asks for)
    sendCalls: (list) => owner.send({ to: address, data: executeBatchCall(list) }),
    transfer: (token, to, amount) => wallet.send({ to: token, data: calls.transfer(to, amount) }),
    sendEth: (to, wei) => wallet.send({ to, value: wei }),
  };
  return wallet;
}
