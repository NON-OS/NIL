// The name a phone wallet gives itself, cut to fit a line. It comes from the wallet, so it is
// only ever shown as text, and the icon it names, a web address, is never loaded.
export default function peerName(metadata: unknown): string {
  const name = (metadata as { name?: unknown } | null)?.name;
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim() : '';
  return clean ? clean.slice(0, 40) : 'Phone wallet';
}
