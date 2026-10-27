// The same rule the editor's link mark applies: web and mail addresses only, so nothing a file
// brings in can turn into a javascript: or data: link.
const SAFE = /^(https?:\/\/|mailto:)/i;

export default function safeHref(href: unknown) {
  const url = typeof href === 'string' ? href.trim() : '';
  return SAFE.test(url) && !/[\u0000-\u001f\u007f]/.test(url) ? url : null;
}
