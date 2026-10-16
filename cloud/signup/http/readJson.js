import HttpError from '../../lib/HttpError.js';

// Sign-up requests are a few hundred bytes; anything much larger is refused before parsing.
export default async function readJson(req, limit = 8 * 1024) {
  if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) throw HttpError.badRequest('Send JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw HttpError.badRequest('The request body wasn’t valid JSON.');
  }
}
