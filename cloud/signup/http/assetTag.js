import crypto from 'node:crypto';

// A strong ETag for a file the sign-up site serves: any change to its bytes gives a new one.
export default function assetTag(body) {
  return `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
}
