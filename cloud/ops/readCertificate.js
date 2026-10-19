import tls from 'node:tls';

// The certificate a TLS server presents for `name`, checked the way a browser would: the chain
// up to a trusted root (the system's, unless `ca` names others) and the name itself. A server
// whose certificate doesn't pass rejects with the TLS error code, such as CERT_HAS_EXPIRED.
// `address` connects somewhere other than what `name` resolves to; the name is still the one
// asked for and checked.
export default function readCertificate(name, { address = name, port = 443, ca, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: address, port, servername: name, ca, rejectUnauthorized: true });
    socket.setTimeout(timeoutMs, () => socket.destroy(Object.assign(new Error(`No TLS answer for ${name} within ${timeoutMs / 1000} s.`), { code: 'ETIMEDOUT' })));
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      const { valid_to: validTo } = socket.getPeerCertificate();
      socket.end();
      resolve({ validTo: new Date(validTo) });
    });
  });
}
