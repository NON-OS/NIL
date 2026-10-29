// NØNOS scenes, each with the Ø somewhere in the night, shown where a camera is off: on a
// person's tile, behind who you're calling, on a ringing call. Each person keeps the same one,
// picked from their account id, so everyone in a call sees the same scene for them and it
// becomes theirs. The pictures ship with the app; nothing is fetched from anywhere else.
const files = import.meta.glob<string>('../../assets/calls/*.webp', { query: '?url', import: 'default', eager: true });
const scenes = Object.keys(files)
  .sort()
  .map((name) => files[name]);

// FNV-1a over the id: quick, stable, and spread evenly enough over a handful of pictures
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export default function callScene(id: string | null | undefined): string | null {
  if (!id || !scenes.length) return null;
  return scenes[hash(id) % scenes.length];
}
