import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import addressOf from './addressOf.mjs';

// A window.ethereum in the page that answers like a browser wallet and signs personal_sign
// messages with this person's key. The key stays in Node; the page only sees signatures.
export default async function wallet(page, hex) {
  const key = hexToBytes(hex);
  const address = addressOf(hex);
  await page.exposeFunction('__nilSign', (msgHex) => {
    const body = hexToBytes(msgHex.slice(2));
    const sig = secp256k1.sign(keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body)), key);
    return `0x${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
  });
  await page.addInitScript((who) => {
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [who];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'personal_sign') return window.__nilSign(params[0]);
        throw Object.assign(new Error(`unsupported ${method}`), { code: 4200 });
      },
    };
  }, address);
  return address;
}
