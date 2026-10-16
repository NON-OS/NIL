// A member's published keys as the server lists them, with the wallet signature behind them.
export default interface KeyEntry {
  userId: string;
  // X25519, base64url: what keys are sealed to
  publicKey: string;
  // Ed25519, base64url: what checks the member's signatures on docs and private tasks
  signingKey: string;
  createdAt: number;
  // the linked wallet that signed the statement
  address: string;
  signature: string;
  // false once deactivated: still checked as an author, never shared with
  active: boolean;
}
