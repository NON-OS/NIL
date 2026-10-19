import fs from 'node:fs';
import escapeHtml from './escapeHtml.js';

const template = (file) => fs.readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8');

function footer(config) {
  const links = [
    config.links.source && `<a href="${escapeHtml(config.links.source)}" rel="noopener noreferrer">Source code</a>`,
    config.links.terms && `<a href="${escapeHtml(config.links.terms)}" rel="noopener noreferrer">Terms</a>`,
    config.links.privacy && `<a href="${escapeHtml(config.links.privacy)}" rel="noopener noreferrer">Privacy</a>`,
    config.links.imprint && `<a href="${escapeHtml(config.links.imprint)}" rel="noopener noreferrer">Imprint</a>`,
    config.contact && `<span>Contact: ${escapeHtml(config.contact)}</span>`,
  ].filter(Boolean);
  return links.join('\n');
}

// With phone wallets on: the project ID, relay and script address for the page's script, the
// button, the dialog it opens and a line in the facts. With them off, every one of these is empty.
function phoneParts(phone, disabled, src) {
  if (!phone) return { phoneData: '', phoneButton: '', phoneDialog: '', phoneFact: '' };
  return {
    phoneData: ` data-phone-project="${escapeHtml(phone.projectId)}" data-phone-relay="${escapeHtml(phone.relayUrl)}" data-phone-src="${escapeHtml(src('/assets/phone.js'))}"`,
    // shown by the page's script on computers; on a phone the wallet app is on the same screen
    phoneButton: `\n          <button type="button" id="phone" class="secondary" hidden${disabled}>Use a wallet on your phone</button>`,
    phoneDialog: `\n${template('phone.html').trimEnd()}`,
    phoneFact: ' With a wallet on your phone, the page also talks to WalletConnect’s relay, which passes encrypted messages between this page and your phone and can’t read them.',
  };
}

function fill(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Template value missing: ${key}`);
    return values[key];
  });
}

// The sign-up and "unavailable" pages, filled in from the configuration once at startup.
// Values are escaped; only the footer and notices are built here as HTML. The page itself is never
// cached, and it names its script and styles with their content tag in the address, so a release
// reaches every browser on its next visit, whatever copy of the old files it still holds.
export default function renderPages(config, assets) {
  const src = (route) => `${route}?v=${assets.get(route).etag.slice(1, 17)}`;
  const common = { domain: escapeHtml(config.domain), footer: footer(config), css: escapeHtml(src('/assets/signup.css')) };
  const index = template('index.html');
  const unavailable = template('unavailable.html');
  return {
    index: (closedReason) =>
      fill(index, {
        ...common,
        ...phoneParts(config.walletConnect, closedReason ? ' disabled' : '', src),
        js: escapeHtml(src('/assets/signup.js')),
        nameMin: String(config.signup.nameMin),
        nameMax: String(config.signup.nameMax),
        powBits: String(config.signup.powBits),
        closedNotice: closedReason ? `<p class="notice">${escapeHtml(closedReason)}</p>` : '',
        disabled: closedReason ? ' disabled' : '',
      }),
    unavailable: (title, detail) =>
      fill(unavailable, {
        ...common,
        title: escapeHtml(title),
        detail: escapeHtml(detail),
        contact: config.contact ? `<p>If this is your workspace, contact ${escapeHtml(config.contact)}.</p>` : '',
      }),
  };
}
