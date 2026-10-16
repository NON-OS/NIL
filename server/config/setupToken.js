import configWarning from '../lib/configWarning.js';

// The one-time token that claims a fresh server. Without one, the server makes its own at first
// start and prints it once. It travels in a header, so only printable ASCII will do.
function setupToken(value) {
  if (!value) return null;
  if (/^[\x21-\x7e]{16,200}$/.test(value)) return value;
  configWarning('SETUP_TOKEN must be 16 to 200 printable characters with no spaces. It’s ignored, and the server makes its own token at first start.');
  return null;
}

export default setupToken((process.env.SETUP_TOKEN ?? '').trim());
