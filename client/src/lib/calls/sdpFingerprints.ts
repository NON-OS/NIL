// The DTLS certificate fingerprints a session description announces, as "sha-256 AB:CD:...",
// sorted and without repeats. Browsers refuse a media connection whose certificate doesn't
// match the fingerprint in the description they were given, so whoever signs these vouches for
// the connection itself.
const LINE = /^a=fingerprint:(\S+) ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2})+)\s*$/;

export default function sdpFingerprints(sdp: string): string[] {
  const out = new Set<string>();
  for (const line of sdp.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) out.add(`${match[1].toLowerCase()} ${match[2].toUpperCase()}`);
  }
  return [...out].sort();
}
