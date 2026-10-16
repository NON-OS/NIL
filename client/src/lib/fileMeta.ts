// A file's name and type as Nil seals, shows and saves them: a bare name with no path, quotes or
// control characters, and a type without parameters, within the lengths the server keeps for a
// plain file. Applied to what comes out of a sealed file too, since another key holder wrote it.
export default function fileMeta(name: unknown, type: unknown) {
  const bare = String(name ?? '').split(/[\\/]/).pop() ?? '';
  return {
    name: bare.replace(/[\u0000-\u001f\u007f"]/g, '').slice(0, 200) || 'file',
    type: String(type ?? '').split(';')[0].trim().toLowerCase().slice(0, 100) || 'application/octet-stream',
  };
}
