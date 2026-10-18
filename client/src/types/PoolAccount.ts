// The team's pool account as the server keeps it: sealed and encrypted, never readable there.
export default interface PoolAccount {
  exists: boolean;
  keyTag?: string;
  startBlock?: number;
  notes?: string;
  notesRev?: number;
  notesBy?: string | null;
  updatedAt?: number;
  // the key sealed to you, if you hold it
  wrapped?: string | null;
  holders?: string[];
}
