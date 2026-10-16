import http from 'node:http';

// A JSON POST with headers of the test's choosing. fetch won't let a test set its own Host
// header, and a phishing proxy relaying requests to the server would.
export default function rawPost(base, path, body, headers = {}) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: new URL(base).port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-NONOS': '1', ...headers } },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}
