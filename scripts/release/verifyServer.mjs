import { randomBytes } from 'node:crypto';
import cspProblems from './cspProblems.mjs';
import fetchFile from './fetchFile.mjs';

// Routes people open the app on. The server answers each of them with index.html, and one that
// meant harm could answer a single route differently, so each is held to index.html's hash too,
// along with a made-up path nobody uses.
const ROUTES = ['/', '/board', '/calendar', '/docs', '/inbox', '/votes', '/bounties', '/settings'];

// Fetches every file of a release from a running server and compares it byte for byte. Returns
// how many addresses were checked and every difference found; no differences means the server
// sent this check exactly the release.
export default async function verifyServer({ base, files, userAgent, concurrency = 6 }) {
  const index = new Map(files).get('/index.html');
  if (!index) throw new Error('The manifest has no /index.html, so it is not a Nil web build.');
  const routes = [...ROUTES, `/${randomBytes(6).toString('hex')}`].map((route) => [route, index]);
  const queue = [...files, ...routes];
  const problems = [];
  let csp = null;
  let checked = 0;
  const work = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [file, sha] = job;
      try {
        const got = await fetchFile(new URL(file, base), userAgent);
        if (file === '/') csp = got.headers.get('content-security-policy');
        if (got.status !== 200) problems.push(`${file} answered ${got.status}.`);
        else if (got.sha !== sha) problems.push(`${file} is different: its SHA-256 is ${got.sha}.`);
      } catch (err) {
        problems.push(`${file} couldn't be fetched: ${err.cause?.message ?? err.message}`);
      }
      checked += 1;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
  problems.push(...cspProblems(csp));
  return { checked, files: files.length, routes: routes.length, problems };
}
