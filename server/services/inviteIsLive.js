// An invite works until it expires, is revoked or runs out of uses. A single-use link has
// max_uses 1; a reusable one without a limit has none.
export default function inviteIsLive(row, now = Date.now()) {
  return Boolean(row) && !row.revoked_at && row.expires_at > now && (row.max_uses === null || row.uses < row.max_uses);
}
