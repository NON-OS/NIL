'use strict';

// Sign-up in the browser: check the address, have the wallet sign the server's message, and
// show the setup code once. No framework and no third-party code; the wallet is whatever
// EIP-1193 provider the browser injects (MetaMask, Rabby, a wallet's own browser), or a phone
// wallet where the host offers one (WalletConnect's client, in /assets/phone.js, loads only then).
(() => {
  const app = document.getElementById('app');
  if (!app) return;
  const domain = app.dataset.domain;
  const $ = (id) => document.getElementById(id);
  const form = $('signup-form');
  const input = $('name');
  const hint = $('name-hint');
  const button = $('go');
  const errorBox = $('error');
  const defaultHint = hint.textContent;
  let codeShown = false;
  let copied = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function api(method, path, body, headers = {}) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'x-nil-signup': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      const err = new Error('Couldn’t reach the server. Check your connection and try again.');
      err.offline = true;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function showHint(text, kind) {
    hint.textContent = text;
    hint.className = kind ? `hint ${kind}` : 'hint';
  }

  function showError(err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }

  function step(id) {
    for (const name of ['step-name', 'step-wait', 'step-done']) $(name).hidden = name !== id;
  }

  let timer = null;
  input.addEventListener('input', () => {
    const lower = input.value.toLowerCase();
    if (lower !== input.value) input.value = lower;
    clearTimeout(timer);
    const name = lower.trim();
    if (!name) return showHint(defaultHint);
    timer = setTimeout(async () => {
      try {
        const result = await api('GET', `/api/names/${encodeURIComponent(name)}`);
        if (input.value.trim() !== name) return;
        showHint(result.available ? `${name}.${domain} is available.` : result.reason, result.available ? 'ok' : 'bad');
      } catch (err) {
        showHint(err.message, 'bad');
      }
    }, 350);
  });

  const provider = () => window.ethereum || null;

  function walletError(err) {
    if (err && err.code === 4001) return new Error('You declined the request in your wallet.');
    if (err && err.code === -32002) return new Error('Your wallet already has a request waiting. Open it to continue.');
    return new Error((err && err.message) || 'Your wallet returned an error.');
  }

  const toHex = (text) => `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')}`;

  function zeroBits(bytes) {
    let bits = 0;
    for (const byte of bytes) {
      if (byte === 0) {
        bits += 8;
        continue;
      }
      bits += Math.clz32(byte) - 24;
      break;
    }
    return bits;
  }

  // The server's small proof-of-work puzzle (see proofOfWork.js), solved in batches so it
  // doesn't block the page while the wallet waits for a signature.
  async function solve(salt, bits) {
    if (!bits) return '0';
    const encoder = new TextEncoder();
    for (let start = 0; ; start += 512) {
      const batch = [];
      for (let n = start; n < start + 512; n++) batch.push(crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${n}`)).then((digest) => [n, digest]));
      for (const [n, digest] of await Promise.all(batch)) if (zeroBits(new Uint8Array(digest)) >= bits) return String(n);
    }
  }

  // The setup code, once. A sign-up waiting for approval gets its code now as well, since the
  // page won't be open when the operator approves it.
  function showDone(result, waiting = false) {
    $('setup-code').textContent = result.setupToken;
    const link = $('ws-link');
    link.href = result.url;
    link.textContent = result.url.replace(/^https:\/\//, '');
    if (waiting) {
      $('done-title').textContent = 'Your workspace is waiting for approval';
      $('done-days').textContent = String(result.days);
      $('done-waiting').hidden = false;
    }
    codeShown = true;
    step('step-done');
  }

  async function waitUntilReady(created) {
    step('step-wait');
    $('wait-name').textContent = `${created.name}.${domain}`;
    for (let attempt = 0; attempt < 150; attempt++) {
      await sleep(2000);
      let status;
      try {
        status = await api('GET', '/api/status', null, { 'x-signup-ticket': created.ticket });
      } catch (err) {
        // a dropped connection is retried; anything the server says is final
        if (err.offline) continue;
        throw err;
      }
      if (status.state === 'provisioning') continue;
      if (status.state !== 'ready') throw new Error(status.message);
      return showDone(status);
    }
    throw new Error('This is taking longer than it should. Your workspace may still appear; if it doesn’t, contact the host.');
  }

  // A phone wallet over WalletConnect, when the host offers one: computers and tablets, not phones,
  // since on a phone the wallet app is on the same screen and opening this page in its browser is
  // the way in. The same rule as the workspace app's (client/src/lib/isHandset.ts).
  // WalletConnect's client and the dialog's code load on first use, from this site.
  const phoneButton = $('phone');
  const phoneDialog = $('phone-dialog');
  const ua = navigator.userAgent;
  const onPhone = Boolean(navigator.userAgentData?.mobile) || /iPhone|iPod|Android.*Mobile/.test(ua);
  const phoneOn = Boolean(phoneButton && phoneDialog && app.dataset.phoneProject) && !onPhone;
  let phone = null;

  async function usePhone() {
    errorBox.hidden = true;
    const name = input.value.trim();
    if (!name || !input.checkValidity()) {
      input.focus();
      return showHint(defaultHint, 'bad');
    }
    // a name that can't be had is said before the phone is asked for anything
    let free;
    try {
      free = await api('GET', `/api/names/${encodeURIComponent(name)}`);
    } catch (err) {
      return showError(err);
    }
    if (!free.available) {
      input.focus();
      return showHint(free.reason, 'bad');
    }
    phoneDialog.showModal();
    try {
      phone ??= (await import('/assets/phone.js')).default({ dialog: phoneDialog, projectId: app.dataset.phoneProject, relayUrl: app.dataset.phoneRelay, signUp: create });
    } catch {
      phoneDialog.close();
      return showError(new Error('Couldn’t reach the server. Check your connection and try again.'));
    }
    if (phoneDialog.open) phone.open();
  }

  if (phoneOn) {
    phoneButton.hidden = false;
    phoneButton.addEventListener('click', () => void usePhone());
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const wallet = provider();
    if (!wallet && phoneOn) return void usePhone();
    if (!wallet) return showError(new Error('No wallet found. Install a wallet extension such as MetaMask or Rabby, or open this page in your wallet’s browser.'));
    void create(wallet);
  });

  // The sign-up with a wallet: the browser's own, or the phone's. `signed` hears once the wallet
  // has answered the signature request, either way.
  async function create(wallet, signed) {
    const name = input.value.trim();
    button.disabled = true;
    if (phoneOn) phoneButton.disabled = true;
    try {
      let address;
      let chainId;
      try {
        [address] = await wallet.request({ method: 'eth_requestAccounts' });
        chainId = parseInt(await wallet.request({ method: 'eth_chainId' }), 16) || 1;
      } catch (err) {
        throw walletError(err);
      }
      const challenge = await api('POST', '/api/challenge', { name, address, chainId });
      // the same check a workspace makes: never sign a workspace's key message for a server
      if (typeof challenge.message !== 'string' || challenge.message.includes('urn:nil:')) {
        throw new Error('The server asked your wallet to sign something other than a sign-up message, so nothing was signed.');
      }
      const [nonce, signature] = await Promise.all([
        solve(challenge.pow.salt, challenge.pow.bits),
        wallet
          .request({ method: 'personal_sign', params: [toHex(challenge.message), address] })
          .catch((err) => {
            throw walletError(err);
          })
          .finally(() => signed?.()),
      ]);
      const created = await api('POST', '/api/verify', { challengeId: challenge.challengeId, signature, nonce });
      if (created.queued) showDone(created, true);
      else await waitUntilReady(created);
    } catch (err) {
      if (!codeShown) step('step-name');
      showError(err);
      button.disabled = false;
      if (phoneOn) phoneButton.disabled = false;
    }
  }

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('setup-code').textContent);
      copied = true;
      $('copy').textContent = 'Copied';
    } catch {
      $('copy').textContent = 'Select and copy it';
    }
  });

  // the code can't be shown again, so leaving before copying it gets a warning
  window.addEventListener('beforeunload', (event) => {
    if (codeShown && !copied) event.preventDefault();
  });
})();
