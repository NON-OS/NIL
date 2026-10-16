import path from 'node:path';

// CLOUD_BACKUP_TARGET is either file:///mnt/nil-backups, a directory on this machine (usually a
// mounted Hetzner Storage Box or NFS share), or s3://bucket/prefix for any S3-compatible store,
// with its endpoint and keys in the CLOUD_S3_* settings.
export default function parseBackupTarget(read) {
  const value = read.text('CLOUD_BACKUP_TARGET');
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    read.fail('CLOUD_BACKUP_TARGET must look like file:///mnt/nil-backups or s3://bucket/prefix.');
    return null;
  }

  if (url.protocol === 'file:') {
    const dir = path.resolve(decodeURIComponent(url.pathname));
    if (dir === '/') read.fail('CLOUD_BACKUP_TARGET can’t be the root directory.');
    return Object.freeze({ kind: 'file', dir });
  }

  if (url.protocol === 's3:') {
    const endpoint = read.url('CLOUD_S3_ENDPOINT', { protocols: ['https:', 'http:'] });
    const target = {
      kind: 's3',
      bucket: url.hostname,
      prefix: url.pathname.replace(/^\/+|\/+$/g, ''),
      endpoint,
      region: read.text('CLOUD_S3_REGION', 'us-east-1'),
      accessKeyId: read.required('CLOUD_S3_ACCESS_KEY_ID', 'The S3 backup target needs an access key.'),
      secretAccessKey: read.required('CLOUD_S3_SECRET_ACCESS_KEY', 'The S3 backup target needs a secret key.'),
      // 5 MiB is the smallest part S3 accepts; parts are held in memory one at a time
      partBytes: read.number('CLOUD_S3_PART_MB', 16, { min: 5, max: 512 }) * 1024 * 1024,
    };
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket)) read.fail('CLOUD_BACKUP_TARGET names an invalid bucket.');
    if (!endpoint) read.fail('CLOUD_S3_ENDPOINT is not set. The S3 backup target needs the provider’s endpoint, for example https://fsn1.your-objectstorage.com.');
    else if (endpoint.startsWith('http:')) read.warn('CLOUD_S3_ENDPOINT uses plain http. Backups are encrypted either way, but the access key travels in the clear.');
    return Object.freeze(target);
  }

  read.fail('CLOUD_BACKUP_TARGET must start with file:// or s3://.');
  return null;
}
