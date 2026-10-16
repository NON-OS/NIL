const word = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');

// ABI-encodes a few 32-byte static values followed by one dynamic `bytes` value, without the
// 0x. That is the shape of both isValidSignature(bytes32, bytes) and the EIP-6492 validator's
// constructor (address, bytes32, bytes), the only two encodings signature checks need.
export default function abiWithBytes(words, bytesHex) {
  const body = bytesHex.replace(/^0x/, '').toLowerCase();
  const offset = (words.length + 1) * 32;
  const padded = body.padEnd(Math.ceil(body.length / 64) * 64, '0');
  return words.map(word).join('') + word(offset.toString(16)) + word((body.length / 2).toString(16)) + padded;
}
