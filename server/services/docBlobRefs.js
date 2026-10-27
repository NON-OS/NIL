import config from '../config.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

// The pictures and files a doc version says it uses, as stored JSON. Anything malformed, or more
// than a version may name, stores as unknown (null), which keeps every blob the doc has.
export default function docBlobRefs(value) {
  if (!Array.isArray(value) || value.length > config.docs.blobRefsMax || !value.every((id) => typeof id === 'string' && ID.test(id))) return null;
  return JSON.stringify([...new Set(value)].sort());
}
