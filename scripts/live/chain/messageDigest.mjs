import { hexToBytes } from '@noble/hashes/utils';
import personalHash from '../../../server/auth/personalHash.js';

// The digest personal_sign covers. Dapps hand the wallet the message as 0x-hex bytes; Nil's
// messages are UTF-8 text, so the bytes are read back as text first.
export default function messageDigest(message) {
  const text = /^0x([0-9a-f]{2})*$/i.test(message) ? new TextDecoder().decode(hexToBytes(message.slice(2))) : message;
  return personalHash(text);
}
