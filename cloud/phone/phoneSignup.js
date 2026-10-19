import connectPhone from './connectPhone.js';
import drawQr from './drawQr.js';

const QR_LABEL = 'Code for your phone wallet to scan';
const STATUS = {
  starting: 'Getting a code from WalletConnect…',
  waiting: 'Waiting for your phone. The code works for 5 minutes.',
  connected: 'Your phone connected. Confirm the signature on your phone.',
  expired: 'That code ran out before your phone used it.',
  failed: '',
};

const reason = (err) => String(err?.message ?? '');

// What to tell someone when connecting their phone didn't work. The raw error can name the
// connection's topics, so it's never shown; one of these is.
function outcome(err) {
  if (/expired/i.test(reason(err))) return ['expired'];
  if ([4001, 5000, 5001, 5002].includes(err?.code)) return ['failed', 'You declined the connection on your phone.'];
  if (/socket|relay|connection|online/i.test(reason(err))) return ['failed', 'Nil couldn’t reach the WalletConnect relay. Check this computer’s connection, or ask whoever runs the server whether phone wallets work here.'];
  return ['failed', 'Connecting your phone wallet didn’t work. Try again.'];
}

// The dialog behind "Use a wallet on your phone" on the sign-up page: a code to scan or a link to
// copy, then the wallet's name and address while the phone signs the sign-up message. The
// sign-up itself is the page's own (`signUp`), with the phone as its wallet. The dialog closes
// once the phone has answered, and closing it any other way drops the connection.
export default function phoneSignup({ dialog, projectId, relayUrl, signUp }) {
  const el = (id) => dialog.querySelector(`#${id}`);
  const [code, qrBox, copyRow, linkBox, copy, who, status, error, retry, cancel] = ['phone-code', 'phone-qr', 'phone-copy-row', 'phone-link', 'phone-copy', 'phone-who', 'phone-status', 'phone-error', 'phone-retry', 'phone-cancel'].map(el);
  let link = null;
  // bumped by every new code and every close, so a slower attempt that was overtaken stops
  let attempt = 0;

  function show(state, message = null) {
    code.hidden = copyRow.hidden = state !== 'waiting';
    who.hidden = state !== 'connected';
    retry.hidden = state !== 'expired' && state !== 'failed';
    error.hidden = !message;
    error.textContent = message ?? '';
    status.textContent = STATUS[state];
    if (!retry.hidden) retry.focus();
    else if (!dialog.contains(document.activeElement) || document.activeElement.closest('[hidden]')) cancel.focus();
  }

  // the pairing link leaves the page with the connection
  async function drop() {
    const was = link;
    link = null;
    qrBox.replaceChildren();
    linkBox.value = '';
    await was?.close();
  }

  function finish(mine) {
    if (mine !== attempt) return;
    if (dialog.open) dialog.close();
  }

  async function begin() {
    const mine = ++attempt;
    await drop();
    if (mine !== attempt) return;
    show('starting');
    try {
      const next = await connectPhone({ projectId, relayUrl });
      if (mine !== attempt) return void next.close();
      link = next;
      qrBox.replaceChildren(drawQr(next.uri, QR_LABEL, 196));
      linkBox.value = next.uri;
      copy.textContent = 'Copy';
      show('waiting');
      const phone = await next.approved();
      if (mine !== attempt) return;
      el('phone-name').textContent = phone.name;
      el('phone-address').textContent = phone.address;
      show('connected');
      await signUp(phone.wallet, () => finish(mine));
      finish(mine);
    } catch (err) {
      if (mine !== attempt) return;
      await drop();
      show(...outcome(err));
    }
  }

  dialog.addEventListener('close', () => {
    attempt++;
    void drop();
  });
  // the page behind is inert while the dialog is open; Tab and Shift+Tab also wrap inside it
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('button, input')].filter((n) => !n.disabled && !n.closest('[hidden]'));
    const [first, last] = [items[0], items.at(-1)];
    if (event.shiftKey && document.activeElement === first) last.focus();
    else if (!event.shiftKey && document.activeElement === last) first.focus();
    else return;
    event.preventDefault();
  });
  linkBox.addEventListener('focus', () => linkBox.select());
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkBox.value);
      copy.textContent = 'Copied';
    } catch {
      linkBox.select();
      copy.textContent = 'Select and copy it';
    }
  });
  retry.addEventListener('click', () => void begin());
  cancel.addEventListener('click', () => dialog.close());

  return { open: () => void begin() };
}
