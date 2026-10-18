import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import openedText from '../state/openedText';
import docVersions from '../state/docVersions';
import docKeySeal from '../lib/crypto/docKeySeal';
import docText, { type DocPlace } from '../lib/crypto/docText';
import signedText from '../lib/crypto/signedText';
import b64u from '../lib/crypto/b64u';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
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

// Opens one field and checks its author's signature against a key this person can see for them. The author
// named inside has to be the one the server names too.
async function openField(key: Uint8Array, at: DocPlace, blob: string, author: string | null) {
  const signed = signedText.open(await docText.open(key, at, blob));
  const checked = author === signed.by && (await keyDirectory.author(signed.by, null, (k) => signedText.verify(signed, docText.context(at), k)));
  return { text: signed.text, verified: Boolean(checked) };
}

async function decrypt(doc: EncryptedDoc): Promise<DocItem> {
  const key = await keyFor(doc);
  const at = (field: DocPlace['field']) => ({ docId: doc.id, field, version: doc.version });
  const title = await openField(key, at('title'), doc.titleCt, doc.updatedBy);
  const body = doc.bodyCt ? await openField(key, at('body'), doc.bodyCt, doc.updatedBy) : null;
  const verified = title.verified && (body?.verified ?? true);
  const item: DocItem = {
    id: doc.id,
    title: title.text,
    body: body?.text ?? null,
    version: doc.version,
    audience: doc.audience,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    readers: doc.readers,
    warning: !verified ? 'unverified' : docVersions.check(doc.id, doc.version) === 'rollback' ? 'rollback' : null,
  };
  // so search in this tab can find it, for as long as the keys stay unlocked
  openedText.rememberDoc(item);
  return item;
}

// This person's own copy goes to their unlocked key directly; everyone else's to a confirmed key.
async function sealFor(docKey: Uint8Array, userIds: string[]): Promise<Grant[]> {
  const me = store.get().me!.id;
  const keys = await keyDirectory.sharable(userIds.filter((id) => id !== me));
  const grants: Grant[] = [];
  if (userIds.includes(me)) grants.push({ userId: me, wrappedKey: await docKeySeal.seal(docKey, identity().publicKey) });
  for (const [userId, publicKey] of keys) grants.push({ userId, wrappedKey: await docKeySeal.seal(docKey, publicKey) });
  return grants;
}

// Each field is signed by its author for this doc, field and version, then encrypted with the
// version in the additional data.
async function sealed(docKey: Uint8Array, docId: string, version: number, title: string, body: string) {
  const by = store.get().me!.id;
  const { signingPrivate } = identity();
  const field = (f: DocPlace['field'], text: string) => {
    const at = { docId, field: f, version };
    return docText.seal(docKey, at, signedText.seal(text, { context: docText.context(at), by, signingPrivate }));
  };
  return { titleCt: await field('title', title || 'Untitled'), bodyCt: await field('body', body) };
}

const unverified = (doc: DocItem) => {
  if (doc.warning === 'unverified') throw new Error('Nil can’t confirm a teammate wrote this version, so it won’t write to it or share it under the same key.');
};

const docs = {
  async list() {
    const res = await http.get<{ docs: EncryptedDoc[]; waiting: { id: string; createdBy: string | null; updatedAt: number }[] }>('/docs');
    const items = await Promise.all(res.docs.map((d) => decrypt(d).catch(() => null)));
    return { docs: items.filter((d): d is DocItem => d !== null), waiting: res.waiting };
  },

  open: (id: string) => http.get<{ doc: EncryptedDoc }>(`/docs/${id}`).then((r) => decrypt(r.doc)),

  // A team doc is sealed for everyone whose key this person has confirmed; the rest get it handed
  // over by a teammate's browser once confirmed there (see shareWithTeam).
  async create({ title, body, audience, people = [] }: { title: string; body: string; audience: 'team' | 'people'; people?: string[] }) {
    const me = store.get().me!;
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const docKey = crypto.getRandomValues(new Uint8Array(32));
    // agents never read docs: they hold no key
    const everyone = audience === 'team' ? Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent').map((u) => u.id) : people;
    const grants = await sealFor(docKey, [me.id, ...everyone]);
    const res = await http.post<{ doc: EncryptedDoc }>('/docs', { id, audience, grants, ...(await sealed(docKey, id, 1, title, body)) });
    keyring.rememberDocKey(id, docKey);
    return decrypt(res.doc);
  },

  async save(doc: DocItem, title: string, body: string) {
    unverified(doc);
    const key = keyring.docKey(doc.id);
    if (!key) throw new Error('Reopen the doc to save it.');
    const res = await http.put<{ doc: EncryptedDoc }>(`/docs/${doc.id}`, { baseVersion: doc.version, ...(await sealed(key, doc.id, doc.version + 1, title, body)) });
    return decrypt(res.doc);
  },

  async share(doc: DocItem, userIds: string[]) {
    unverified(doc);
    const key = keyring.docKey(doc.id);
    if (!key) throw new Error('Reopen the doc to share it.');
    const adding = userIds.filter((u) => !doc.readers.includes(u));
    await confirmKeys.ask(adding, 'this doc');
    const grants = await sealFor(key, adding);
    if (!grants.length) return doc.readers;
    return (await http.post<{ readers: string[] }>(`/docs/${doc.id}/grants`, { grants })).readers;
  },

  // Taking someone out means a new key for the doc, so a copy of the old one is worthless. It
  // also re-signs the text as yours, which is how a doc that failed its check gets a clean key.
  async restrict(doc: DocItem, keep: string[], audience: 'team' | 'people') {
    const me = store.get().me!;
    await confirmKeys.ask(keep, 'this doc');
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    const grants = await sealFor(fresh, [me.id, ...keep]);
    const res = await http.post<{ readers: string[] }>(`/docs/${doc.id}/rotate`, { baseVersion: doc.version, audience, grants, ...(await sealed(fresh, doc.id, doc.version + 1, doc.title, doc.body ?? '')) });
    keyring.rememberDocKey(doc.id, fresh);
    return res.readers;
  },

  // Hands team docs to teammates who joined or unlocked after the doc was written, once this
  // person has confirmed their keys. Never asks, never shares a doc that failed its check.
  async shareWithTeam(items: DocItem[]) {
    const people = Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent').map((u) => u.id);
    const ready = new Set((await keyDirectory.sharable(people)).keys());
    for (const doc of items.filter((d) => d.audience === 'team' && !d.warning)) {
      const missing = people.filter((u) => ready.has(u) && !doc.readers.includes(u));
      const key = keyring.docKey(doc.id);
      if (!missing.length || !key) continue;
      const grants = await sealFor(key, missing);
      if (grants.length) await http.post(`/docs/${doc.id}/grants`, { grants }).catch(() => {});
    }
  },

  async revisions(doc: DocItem) {
    const key = keyring.docKey(doc.id);
    if (!key) return [];
    const rows = await http.get<{ version: number; titleCt: string; bodyCt: string; updatedBy: string | null; createdAt: number }[]>(`/docs/${doc.id}/revisions`);
    return Promise.all(
      rows.map(async (r) => {
        const at = (field: DocPlace['field']) => ({ docId: doc.id, field, version: r.version });
        const [title, body] = await Promise.all([openField(key, at('title'), r.titleCt, r.updatedBy), openField(key, at('body'), r.bodyCt, r.updatedBy)]);
        return { version: r.version, updatedBy: r.updatedBy, createdAt: r.createdAt, title: title.text, body: body.text, verified: title.verified && body.verified };
      }),
    );
  },

  async remove(doc: DocItem) {
    await http.del(`/docs/${doc.id}`);
    keyring.forgetDocKey(doc.id);
    openedText.forgetDoc(doc.id);
  },
};

export default docs;
