import crypto from 'node:crypto';

const hkdf = (ikm, salt, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

// A browser's side of Web Push: its subscription keys, and RFC 8291 decryption of what arrives.
export default function pushBrowser(host) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const subscription = {
    endpoint: `https://${host}/send/${crypto.randomBytes(12).toString('base64url')}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  };
  const open = (body) => {
    const salt = body.subarray(0, 16);
    const keyLength = body[20];
    const senderKey = body.subarray(21, 21 + keyLength);
    const sealed = body.subarray(21 + keyLength);
    const ikm = hkdf(ecdh.computeSecret(senderKey), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), senderKey]), 32);
    const decipher = crypto.createDecipheriv('aes-128-gcm', hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    decipher.setAuthTag(sealed.subarray(-16));
    const record = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
    let end = record.length - 1;
    while (record[end] === 0) end--;
    if (record[end] !== 2) throw new Error('bad padding delimiter');
    return { message: JSON.parse(record.subarray(0, end).toString('utf8')), paddedTo: record.length, recordSize: body.readUInt32BE(16) };
  };
  return { subscription, open };
}
