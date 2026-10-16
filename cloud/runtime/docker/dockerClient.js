import http from 'node:http';
import DockerError from './DockerError.js';

async function readAll(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function reason(body) {
  try {
    return JSON.parse(body.toString()).message || body.toString();
  } catch {
    return body.toString().trim() || 'no details';
  }
}

// A small Docker Engine API client over the local socket. The control plane uses about twenty
// endpoints, which node:http covers without a large SDK and its dependency tree. The API
// version is pinned so a Docker upgrade can't change response shapes under us.
export default function dockerClient({ socket, apiVersion, timeoutMs = 120_000 }) {
  function open(method, path, { query, body, headers = {}, timeout = timeoutMs } = {}) {
    const params = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : '';
    const streaming = body && typeof body.pipe === 'function';
    const payload = body === undefined || streaming || Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const finalHeaders = { ...headers };
    if (Buffer.isBuffer(payload)) {
      finalHeaders['content-length'] = payload.length;
      if (!Buffer.isBuffer(body)) finalHeaders['content-type'] ??= 'application/json';
    }
    return new Promise((resolve, reject) => {
      const req = http.request({ socketPath: socket, method, path: `/v${apiVersion}${path}${params ? `?${params}` : ''}`, headers: finalHeaders }, resolve);
      req.on('error', reject);
      // an idle timeout, not a total one: a large archive may stream for a long time
      req.setTimeout(timeout, () => req.destroy(new Error(`Docker didn’t answer ${method} ${path} in time.`)));
      if (streaming) {
        body.on('error', (err) => req.destroy(err));
        body.pipe(req);
      } else {
        req.end(payload);
      }
    });
  }

  const client = {
    // Parsed JSON for 2xx, null for 204 and 304 (304 means "already in that state").
    async json(method, path, options) {
      const res = await open(method, path, options);
      const body = await readAll(res);
      if (res.statusCode >= 400) throw new DockerError(res.statusCode, reason(body), path);
      if (!body.length) return null;
      return /json/.test(res.headers['content-type'] ?? '') ? JSON.parse(body.toString()) : body.toString();
    },

    // The raw response, for archives, exec output and pull progress.
    async stream(method, path, options) {
      const res = await open(method, path, options);
      if (res.statusCode >= 400) throw new DockerError(res.statusCode, reason(await readAll(res)), path);
      return res;
    },

    // For calls where "doesn't exist" is a fine answer (removing what's already gone).
    async quiet(method, path, options, okStatuses = [404]) {
      try {
        return await client.json(method, path, options);
      } catch (err) {
        if (err instanceof DockerError && okStatuses.includes(err.status)) return null;
        throw err;
      }
    },
  };
  return client;
}
