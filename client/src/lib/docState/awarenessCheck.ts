import * as decoding from 'lib0/decoding';

const COLOR = /^#[0-9a-f]{6}$/i;
const id = (v: unknown) => typeof v === 'object' && v !== null && Number.isSafeInteger((v as any).client) && (v as any).client >= 0 && Number.isSafeInteger((v as any).clock) && (v as any).clock >= 0;
const exactly = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

// A position in the doc as Yjs writes it for a cursor: an item id or a type, an optional type
// name and which side it leans to. Anything else would throw while the cursor is drawn.
function position(p: unknown) {
  if (typeof p !== 'object' || p === null || Array.isArray(p) || !exactly(p, ['type', 'tname', 'item', 'assoc'])) return false;
  const { type, tname, item, assoc } = p as Record<string, unknown>;
  if (type != null && !id(type)) return false;
  if (item != null && !id(item)) return false;
  if (tname != null && (typeof tname !== 'string' || tname.length > 64)) return false;
  return assoc == null || (Number.isInteger(assoc) && Math.abs(assoc as number) <= 1);
}

function state(s: unknown, from: string) {
  if (s === null) return true;
  if (typeof s !== 'object' || Array.isArray(s) || !exactly(s, ['user', 'cursor'])) return false;
  const { user, cursor } = s as Record<string, any>;
  // the caret extension always adds an empty name; a name with anything in it is refused
  if (typeof user !== 'object' || user === null || !exactly(user, ['id', 'color', 'name']) || user.name != null || user.id !== from || !COLOR.test(user.color)) return false;
  return cursor == null || (typeof cursor === 'object' && exactly(cursor, ['anchor', 'head']) && position(cursor.anchor) && position(cursor.head));
}

// Reads a teammate's cursor update before it reaches the editor: exactly one cursor, for the
// account the server says sent it, in the shape the editor draws and nothing more. Returns the
// cursor's client id, or null for anything else, which is dropped.
export default function awarenessCheck(payload: Uint8Array, from: string): number | null {
  try {
    const d = decoding.createDecoder(payload);
    if (decoding.readVarUint(d) !== 1) return null;
    const clientID = decoding.readVarUint(d);
    decoding.readVarUint(d);
    const json = decoding.readVarString(d);
    if (decoding.hasContent(d) || json.length > 2048) return null;
    return state(JSON.parse(json), from) ? clientID : null;
  } catch {
    return null;
  }
}
