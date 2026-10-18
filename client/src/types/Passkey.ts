// One passkey wrap of your identity, as the server keeps it. Only your own come to your browser.
export default interface Passkey {
  id: string;
  // base64url WebAuthn credential id, and the salt its PRF output is asked for
  credentialId: string;
  salt: string;
  wrapped: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}
