import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import docKeySeal from '../lib/crypto/docKeySeal';
import docText from '../lib/crypto/docText';
import b64u from '../lib/crypto/b64u';
import type DocItem from '../types/DocItem';
import type EncryptedDoc from '../types/EncryptedDoc';

type Grant = { userId: string; wrappedKey: string };

function identity() {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your docs first.');
  return id;
}

async function keyFor(doc: EncryptedDoc) {
  const cached = keyring.docKey(doc.id);
  if (cached) return cached;
  const { privateKey, publicKey } = identity();
  const key = await docKeySeal.open(doc.wrappedKey, privateKey, publicKey);
  keyring.rememberDocKey(doc.id, key);
  return key;
}

async function decrypt(doc: EncryptedDoc): Promise<DocItem> {
  const key = await keyFor(doc);
  return {
    id: doc.id,
    title: await docText.open(key, doc.id, 'title', doc.titleCt),
    body: doc.bodyCt ? await docText.open(key, doc.id, 'body', doc.bodyCt) : null,
    version: doc.version,
    audience: doc.audience,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    readers: doc.readers,
  };
}

const directory = () => http.get<{ userId: string; publicKey: string }[]>('/encryption-keys');

async function sealFor(docKey: Uint8Array, userIds: string[]): Promise<Grant[]> {
  const keys = new Map((await directory()).map((k) => [k.userId, k.publicKey]));
  const grants: Grant[] = [];
  for (const userId of new Set(userIds)) {
    const pub = keys.get(userId);
    if (pub) grants.push({ userId, wrappedKey: await docKeySeal.seal(docKey, b64u.decode(pub)) });
  }
  return grants;
}

async function sealed(docKey: Uint8Array, id: string, title: string, body: string) {
  return { titleCt: await docText.seal(docKey, id, 'title', title || 'Untitled'), bodyCt: await docText.seal(docKey, id, 'body', body) };
}

const docs = {
  async list() {
    const res = await http.get<{ docs: EncryptedDoc[]; waiting: { id: string; createdBy: string | null; updatedAt: number }[] }>('/docs');
    const items = await Promise.all(res.docs.map((d) => decrypt(d).catch(() => null)));
    return { docs: items.filter((d): d is DocItem => d !== null), waiting: res.waiting };
  },

  open: (id: string) => http.get<{ doc: EncryptedDoc }>(`/docs/${id}`).then((r) => decrypt(r.doc)),

  // A team doc is sealed for everyone who has an encryption key today; the rest get it handed
  // over by whichever teammate's browser notices first (see shareWithTeam).
  async create({ title, body, audience, people = [] }: { title: string; body: string; audience: 'team' | 'people'; people?: string[] }) {
    const me = store.get().me!;
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const docKey = crypto.getRandomValues(new Uint8Array(32));
    const everyone = audience === 'team' ? Object.values(store.get().users).filter((u) => !u.deactivated).map((u) => u.id) : people;
    const grants = await sealFor(docKey, [me.id, ...everyone]);
    const res = await http.post<{ doc: EncryptedDoc }>('/docs', { id, audience, grants, ...(await sealed(docKey, id, title, body)) });
    keyring.rememberDocKey(id, docKey);
    return decrypt(res.doc);
  },

  async save(doc: DocItem, title: string, body: string) {
    const key = keyring.docKey(doc.id);
    if (!key) throw new Error('Reopen the doc to save it.');
    const res = await http.put<{ doc: EncryptedDoc }>(`/docs/${doc.id}`, { baseVersion: doc.version, ...(await sealed(key, doc.id, title, body)) });
    return decrypt(res.doc);
  },

  async share(doc: DocItem, userIds: string[]) {
    const key = keyring.docKey(doc.id);
    if (!key) throw new Error('Reopen the doc to share it.');
    const grants = await sealFor(key, userIds.filter((u) => !doc.readers.includes(u)));
    if (!grants.length) return doc.readers;
    return (await http.post<{ readers: string[] }>(`/docs/${doc.id}/grants`, { grants })).readers;
  },

  // Taking someone out means a new key for the doc, so a copy of the old one is worthless.
  async restrict(doc: DocItem, keep: string[], audience: 'team' | 'people') {
    const me = store.get().me!;
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    const grants = await sealFor(fresh, [me.id, ...keep]);
    const res = await http.post<{ readers: string[] }>(`/docs/${doc.id}/rotate`, { baseVersion: doc.version, audience, grants, ...(await sealed(fresh, doc.id, doc.title, doc.body ?? '')) });
    keyring.rememberDocKey(doc.id, fresh);
    return res.readers;
  },

  // Hands team docs to teammates who joined or unlocked after the doc was written.
  async shareWithTeam(items: DocItem[]) {
    const people = Object.values(store.get().users).filter((u) => !u.deactivated).map((u) => u.id);
    const keys = new Set((await directory()).map((k) => k.userId));
    for (const doc of items.filter((d) => d.audience === 'team')) {
      const missing = people.filter((u) => keys.has(u) && !doc.readers.includes(u));
      if (missing.length) await docs.share(doc, missing).catch(() => {});
    }
  },

  async revisions(doc: DocItem) {
    const key = keyring.docKey(doc.id);
    if (!key) return [];
    const rows = await http.get<{ version: number; titleCt: string; bodyCt: string; updatedBy: string | null; createdAt: number }[]>(`/docs/${doc.id}/revisions`);
    return Promise.all(
      rows.map(async (r) => ({ version: r.version, updatedBy: r.updatedBy, createdAt: r.createdAt, title: await docText.open(key, doc.id, 'title', r.titleCt), body: await docText.open(key, doc.id, 'body', r.bodyCt) })),
    );
  },

  async remove(doc: DocItem) {
    await http.del(`/docs/${doc.id}`);
    keyring.forgetDocKey(doc.id);
  },
};

export default docs;
