import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import pickEncoding from './pickEncoding.js';

// Build files worth compressing: scripts, styles and text, and the proving circuits, which are
// megabytes each. Images and fonts arrive compressed already, and a file under a kilobyte
// isn't worth it.
const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|webmanifest|txt|wasm|zkey)$/;
const MIN_BYTES = 1024;
// Brotli at 5 is about as small as gzip at its best and fast enough to do on the first request.
const BROTLI_QUALITY = 5;
const GZIP_LEVEL = 6;

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const ENCODE = {
  br: (data) => brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
  gzip: (data) => gzip(data, { level: GZIP_LEVEL }),
};

// Sends the files of a web build compressed, for browsers that accept brotli or gzip, ahead of
// express.static, which serves everything else and everyone else as it always has. Each file is
// compressed once per encoding and kept in memory until it changes, so a busy server or a
// repeated request for a circuit file costs no more CPU; the build's files bound what's kept.
// The bytes a browser ends up with are exactly the file's, which is what verify:server checks.
export default function compressStatic(root, cacheControl) {
  const kept = new Map();

  const compressed = (file, encoding, stat) => {
    const key = `${file}\0${encoding}`;
    const known = kept.get(key);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.body;
    const body = fs.promises.readFile(file).then(ENCODE[encoding]);
    kept.set(key, { mtimeMs: stat.mtimeMs, size: stat.size, body });
    body.catch(() => kept.delete(key));
    return body;
  };

  return async (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !COMPRESSIBLE.test(req.path)) return next();
    // caches between here and the browser keep one copy per encoding
    res.vary('Accept-Encoding');
    const encoding = pickEncoding(req.headers['accept-encoding']);
    if (!encoding || req.headers.range) return next();

    let file;
    try {
      file = path.join(root, decodeURIComponent(req.path));
    } catch {
      return next();
    }
    // only files inside the build, and nothing in a dot folder, as express.static would refuse
    const inside = path.relative(root, file);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || inside.split(path.sep).some((part) => part.startsWith('.'))) return next();
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size < MIN_BYTES) return next();

    let body;
    try {
      body = await compressed(file, encoding, stat);
    } catch {
      return next();
    }
    res.type(path.extname(file));
    res.set({
      'Content-Encoding': encoding,
      'Content-Length': String(body.length),
      'Cache-Control': cacheControl,
      'Last-Modified': stat.mtime.toUTCString(),
      ETag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}-${encoding}"`,
    });
    if (req.fresh) return res.status(304).end();
    res.status(200).end(req.method === 'HEAD' ? undefined : body);
  };
}
