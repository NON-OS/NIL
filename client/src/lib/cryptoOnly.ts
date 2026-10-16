// The sections that exist only while the crypto tools are on.
const PATHS = ['/bounties', '/votes', '/proofs'];

export default function cryptoOnly(path: string) {
  return PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
