import createS3Client from '../s3/createS3Client.js';

// Backups in an S3-compatible bucket. Old backups are removed by a lifecycle rule on the bucket
// rather than by the control plane, so its key can be limited to writing: a compromised server
// then can't delete the backups it made.
export default function s3Target(target, { fetchImpl } = {}) {
  const client = createS3Client({ ...target, fetchImpl });
  const full = (key) => (target.prefix ? `${target.prefix}/${key}` : key);
  return {
    describe: () => `s3://${target.bucket}/${target.prefix}`,
    check: async () => {},
    put: (key, readable) => client.put(full(key), readable),
    get: (location) => client.get(location.startsWith('s3://') ? location.replace(`s3://${target.bucket}/`, '') : full(location)),
    prune: async () => ({ removed: 0, note: 'Expire old backups with a lifecycle rule on the bucket.' }),
  };
}
