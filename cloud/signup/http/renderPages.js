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

function fill(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Template value missing: ${key}`);
    return values[key];
  });
}

// The sign-up and "unavailable" pages, filled in from the configuration once at startup.
// Values are escaped; only the footer and notices are built here as HTML.
export default function renderPages(config) {
  const common = { domain: escapeHtml(config.domain), footer: footer(config) };
  const index = template('index.html');
  const unavailable = template('unavailable.html');
  return {
    index: (closedReason) =>
      fill(index, {
        ...common,
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
