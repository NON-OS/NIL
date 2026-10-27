import { route } from './fakeBrowser.js';

// The blob store and shared folders as a server keeps them, in memory, behind the fake browser's
// routes. Tests reach into `state` to play a dishonest server: swap keys, details, chunks.
export const state = { blobs: new Map(), folders: new Map(), items: new Map(), keys: new Map(), next: 0 };

const id = () => `b${String(++state.next).padStart(11, '0')}`;
const info = (b) => ({ id: b.id, chunks: b.chunks, size: b.size, header: b.header });
const listItem = (i) => ({ ...i, blob: i.blobId ? info(state.blobs.get(i.blobId)) : null, thumb: i.thumbId ? info(state.blobs.get(i.thumbId)) : null });
const folderFor = (f, me) => ({ ...f, wrappedKey: state.keys.get(f.id)?.get(me), readers: [...(state.keys.get(f.id)?.keys() ?? [])] });

// Serves the routes as user `me` (a function, so a test can switch who's asking).
export function serveFiles(me) {
  state.blobs.clear();
  state.folders.clear();
  state.items.clear();
  state.keys.clear();
  route('POST', '/api/blobs', (url, body) => {
    const blob = { id: id(), ...body, parts: [], done: false };
    state.blobs.set(blob.id, blob);
    return { blob: blob.id };
  });
  route('PUT', /^\/api\/blobs\/[^/]+\/chunks\/\d+$/, (url, body) => {
    const [, blob, , index] = url.split('/').slice(2);
    state.blobs.get(blob).parts[Number(index)] = new Uint8Array(body);
    return { ok: true };
  });
  route('POST', /^\/api\/blobs\/[^/]+\/finish$/, (url) => {
    const blob = state.blobs.get(url.split('/')[3]);
    blob.done = true;
    return { blob: info(blob) };
  });
  route('GET', /^\/api\/blobs\/[^/]+$/, (url) => info(state.blobs.get(url.split('/')[3])));
  route('GET', /^\/api\/blobs\/[^/]+\/chunks\/\d+$/, (url) => state.blobs.get(url.split('/')[3]).parts[Number(url.split('/')[5])]);
  route('DELETE', /^\/api\/blobs\/[^/]+$/, (url) => (state.blobs.delete(url.split('/')[3]), { ok: true }));

  route('GET', '/api/folders', () => ({ folders: [...state.folders.values()].filter((f) => state.keys.get(f.id).has(me())).map((f) => folderFor(f, me())), waiting: [], usage: { used: 0, quota: 1e9, maxFile: 1e9 } }));
  route('POST', '/api/folders', (url, body) => {
    const folder = { id: body.id, nameCt: body.nameCt, version: 1, keyRev: 1, audience: body.audience, createdBy: me(), updatedBy: me(), createdAt: 1, updatedAt: 1 };
    state.folders.set(folder.id, folder);
    state.keys.set(folder.id, new Map(body.grants.map((g) => [g.userId, g.wrappedKey])));
    return { folder: folderFor(folder, me()) };
  });
  route('GET', /^\/api\/folders\/[^/]+$/, (url) => {
    const want = decodeURIComponent(url.split('/')[3]);
    const folder = state.folders.get(want) ?? state.folders.get(state.items.get(want)?.folderId);
    return { folder: folderFor(folder, me()), items: [...state.items.values()].filter((i) => i.folderId === folder.id).map(listItem) };
  });
  route('PUT', /^\/api\/folders\/[^/]+$/, (url, body) => {
    const folder = state.folders.get(url.split('/')[3]);
    Object.assign(folder, { nameCt: body.nameCt, version: folder.version + 1, updatedBy: me() });
    return { folder: folderFor(folder, me()) };
  });
  route('POST', /^\/api\/folders\/[^/]+\/grants$/, (url, body) => {
    const keys = state.keys.get(url.split('/')[3]);
    for (const g of body.grants) if (!keys.has(g.userId)) keys.set(g.userId, g.wrappedKey);
    return { readers: [...keys.keys()] };
  });
  route('POST', /^\/api\/folders\/[^/]+\/rotate$/, (url, body) => {
    const folder = state.folders.get(url.split('/')[3]);
    Object.assign(folder, { nameCt: body.nameCt, audience: body.audience, version: folder.version + 1, keyRev: folder.keyRev + 1, updatedBy: me() });
    for (const { id: itemId, keyWrap } of body.items) state.items.get(itemId).keyWrap = keyWrap;
    state.keys.set(folder.id, new Map(body.grants.map((g) => [g.userId, g.wrappedKey])));
    return { readers: [...state.keys.get(folder.id).keys()] };
  });
  route('POST', /^\/api\/folders\/[^/]+\/items$/, (url, body) => {
    const item = { id: body.id, folderId: url.split('/')[3], parentId: body.parentId ?? null, kind: body.kind, keyWrap: body.keyWrap, metaCt: body.metaCt, blobId: body.blobId ?? null, thumbId: body.thumbId ?? null, createdBy: me(), updatedBy: me(), createdAt: 1, updatedAt: 1 };
    state.items.set(item.id, item);
    return { item: listItem(item) };
  });
  route('PATCH', /^\/api\/folders\/[^/]+\/items\/[^/]+$/, (url, body) => {
    const item = state.items.get(url.split('/')[5]);
    Object.assign(item, { parentId: body.parentId ?? null, metaCt: body.metaCt, updatedBy: me() });
    return { item: listItem(item) };
  });
}
