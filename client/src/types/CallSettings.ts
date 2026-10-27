// Whether calls work on this server, and how.
export default interface CallSettings {
  available: boolean;
  // why not: turned off, on Tor, or no relay set up and direct connections not allowed
  reason: 'off' | 'tor' | 'no-relay' | null;
  relay: boolean;
  direct: boolean;
  maxPeers: number;
  ringSeconds: number;
}
