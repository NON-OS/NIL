import net from 'node:net';
import tls from 'node:tls';
import SafeFetchError from './SafeFetchError.js';

const HEAD_LIMIT = 8 * 1024;

// What a refusal from the proxy means for whoever set up the webhook or the model endpoint.
const REFUSALS = {
  403: ['blocked_address', 'The server’s egress proxy won’t connect to that address.'],
  429: ['rate_limited', 'This workspace has too many outbound connections open right now. Try again in a minute.'],
};

const aborted = () => Object.assign(new Error('The request was aborted.'), { name: 'AbortError' });

// A TLS connection to `address`:`port` opened through an HTTP CONNECT proxy, with the server
// name and certificate checked against `host`, the hostname the URL named. The proxy only learns
// the address and port; everything said over the tunnel is encrypted between this server and the
// endpoint. `ca` is for tests with their own certificate authority.
export default function proxyTunnel(proxy, { address, family, port, host, ca, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const url = new URL(proxy);
    const authority = family === 6 ? `[${address}]:${port}` : `${address}:${port}`;
    const user = decodeURIComponent(url.username);
    const auth = user ? `Proxy-Authorization: Basic ${Buffer.from(`${user}:${decodeURIComponent(url.password)}`).toString('base64')}\r\n` : '';
    const socket = net.connect({ host: url.hostname, port: Number(url.port) || 80 });
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      reject(err);
    };
    const onAbort = () => fail(aborted());
    signal?.addEventListener('abort', onAbort, { once: true });

    let head = Buffer.alloc(0);
    const onData = (chunk) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) {
        if (head.length > HEAD_LIMIT) fail(new SafeFetchError('network', 'The egress proxy sent an answer that’s too long.'));
        return;
      }
      socket.off('data', onData);
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head.subarray(0, end).toString('latin1'))?.[1]);
      if (status !== 200) {
        const [code, message] = REFUSALS[status] ?? ['network', `The egress proxy couldn’t connect (${status || 'no status'}).`];
        fail(new SafeFetchError(code, message));
        return;
      }
      const rest = head.subarray(end + 4);
      if (rest.length) socket.unshift(rest);
      const secure = tls.connect({ socket, host, servername: net.isIP(host) ? undefined : host, ca, ALPNProtocols: ['http/1.1'] });
      secure.once('secureConnect', () => {
        if (settled) return secure.destroy();
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(secure);
      });
      secure.once('error', fail);
    };
    socket.on('data', onData);
    socket.once('connect', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth}\r\n`));
    socket.once('error', (err) => fail(new SafeFetchError('network', `The egress proxy can’t be reached (${err.code ?? err.message}).`)));
    socket.once('end', () => fail(new SafeFetchError('network', 'The egress proxy closed the connection.')));
  });
}
