// A request body as text, or null when it is larger than `limit` bytes.
export default function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) return chunks.push(chunk);
      // stop reading; the caller answers 413 and closes the connection
      req.removeAllListeners('data');
      req.pause();
      resolve(null);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
