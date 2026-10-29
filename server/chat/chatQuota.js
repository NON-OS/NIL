import uploadQuota from '../services/uploadQuota.js';

// Chat files count toward the same room as every other file: one person's share
// (UPLOAD_QUOTA_PER_MEMBER_MB) and the whole workspace's storage (UPLOAD_QUOTA_MB), with the same
// hold while an upload is on its way. Returns the release function.
export default function chatQuota(user, bytes) {
  return uploadQuota(user, bytes);
}
