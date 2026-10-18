// The trustee in one seat as this browser knows them: their account, and the signing key pinned
// for them in this browser's key directory. Null when there's no key to check them against.
type Signer = { userId: string; signingKey: Uint8Array } | null;

export default Signer;
