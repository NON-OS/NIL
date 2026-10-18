// Boots the real Nil server against a mock Ethereum chain, with a throwaway data folder, and
// makes a browser wallet the page can sign in with. Signatures are real; nothing leaves the
// machine. Run `npm ci` at the repository root first.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
// the one-time token a fresh server asks for before anyone can create its workspace
const SETUP_TOKEN = 'a11y-check-setup-token';

module.exports = async function world({ port, env = {} }) {
  const { default: mockChain } = await import(`${ROOT}/server/test/helpers/mockChain.js`);
  const { secp256k1 } = await import(`${ROOT}/node_modules/@noble/curves/esm/secp256k1.js`);
  const { keccak_256 } = await import(`${ROOT}/node_modules/@noble/hashes/esm/sha3.js`);
  const { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } = await import(`${ROOT}/node_modules/@noble/hashes/esm/utils.js`);

  const chain = mockChain();
  await new Promise((r) => chain.server.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-a11y-'));
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), APP_URL: base, DATA_DIR: dataDir, NOX_RPC_URL: `http://127.0.0.1:${chain.server.address().port}`, SETUP_TOKEN, ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    base,
    setupToken: SETUP_TOKEN,
    // a window.ethereum in the page that signs like personal_sign, with a new key unless one is
    // given, so the same person can open several pages
    newKey: () => secp256k1.utils.randomPrivateKey(),
    async wallet(page, key = secp256k1.utils.randomPrivateKey()) {
      const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
      await page.exposeFunction('__nilSign', (hex) => {
        const body = hexToBytes(hex.slice(2));
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
    },
    stop() {
      server.kill();
      chain.server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
};
