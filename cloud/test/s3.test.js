import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import signRequest from '../backups/s3/signRequest.js';
import createS3Client from '../backups/s3/createS3Client.js';
import collect from './helpers/collect.js';

test('SigV4 signatures match the example in AWS’s S3 documentation', () => {
  const headers = signRequest({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { Range: 'bytes=0-9' },
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(headers.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.equal(headers['x-amz-date'], '20130524T000000Z');
});

// An S3 endpoint in memory that keeps multipart uploads the way S3 does.
function fakeS3({ failPart = 0, errorInBody = false } = {}) {
  const uploads = new Map();
  const objects = new Map();
  const requests = [];
  const fetchImpl = async (url, { method, headers, body }) => {
    const u = new URL(url);
    requests.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers });
    assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/fsn1\/s3\/aws4_request/);
    assert.equal(headers['x-amz-content-sha256'], crypto.createHash('sha256').update(body ?? '').digest('hex'));
    assert.equal(headers.host, undefined, 'fetch derives Host from the URL itself');
    const key = u.pathname;
    if (method === 'POST' && u.searchParams.has('uploads')) {
      uploads.set('up-1', []);
      return new Response('<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>');
    }
    if (method === 'PUT' && u.searchParams.get('uploadId')) {
      const n = Number(u.searchParams.get('partNumber'));
      if (n === failPart) return new Response('<Error><Code>InternalError</Code><Message>try again</Message></Error>', { status: 500 });
      uploads.get('up-1')[n - 1] = Buffer.from(body);
      return new Response('', { headers: { etag: `"etag-${n}"` } });
    }
    if (method === 'POST' && u.searchParams.get('uploadId')) {
      assert.match(body.toString(), /^<CompleteMultipartUpload>(<Part><PartNumber>\d+<\/PartNumber><ETag>"etag-\d+"<\/ETag><\/Part>)+<\/CompleteMultipartUpload>$/);
      if (errorInBody) return new Response('<Error><Code>InternalError</Code></Error>');
      objects.set(key, Buffer.concat(uploads.get('up-1')));
      return new Response('<CompleteMultipartUploadResult/>');
    }
    if (method === 'DELETE') {
      uploads.delete('up-1');
      return new Response('', { status: 204 });
    }
    if (method === 'GET') return objects.has(key) ? new Response(objects.get(key)) : new Response('<Error><Code>NoSuchKey</Code><Message>gone</Message></Error>', { status: 404 });
    throw new Error(`unexpected ${method} ${key}`);
  };
  const client = createS3Client({ endpoint: 'https://s3.test', region: 'fsn1', bucket: 'nil', accessKeyId: 'AK', secretAccessKey: 'SK', partBytes: 5 * 1024 * 1024, fetchImpl });
  return { client, uploads, objects, requests };
}

test('uploads stream in parts of the configured size and download intact', async () => {
  const s3 = fakeS3();
  const data = crypto.randomBytes(12 * 1024 * 1024 + 123);
  const chunks = [];
  for (let at = 0; at < data.length; at += 300_000) chunks.push(data.subarray(at, at + 300_000));
  const result = await s3.client.put('workspaces/ab/x.nilbackup', Readable.from(chunks));
  assert.deepEqual(result, { location: 's3://nil/workspaces/ab/x.nilbackup', bytes: data.length });
  assert.deepEqual(s3.requests.filter((r) => r.method === 'PUT').map((r) => r.query.partNumber), ['1', '2', '3']);
  assert.deepEqual(await collect(await s3.client.get('workspaces/ab/x.nilbackup')), data);
  await assert.rejects(s3.client.get('missing'), /404 \(NoSuchKey: gone\)/);
});

test('a failed part or a failure reported in a 200 aborts the upload', async () => {
  const failing = fakeS3({ failPart: 2 });
  await assert.rejects(failing.client.put('k', Readable.from([crypto.randomBytes(11 * 1024 * 1024)])), /500 \(InternalError/);
  assert.equal(failing.requests.at(-1).method, 'DELETE');
  const lying = fakeS3({ errorInBody: true });
  await assert.rejects(lying.client.put('k', Readable.from([Buffer.from('small')])), /couldn’t finish the upload/);
  assert.equal(lying.requests.at(-1).method, 'DELETE');
});
