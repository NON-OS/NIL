import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import openedText from '../state/openedText';
import docKeySeal from '../lib/crypto/docKeySeal';
import docText, { type DocPlace } from '../lib/crypto/docText';
import docFacts, { type DocFacts } from '../lib/crypto/docFacts';
import signedFacts from '../lib/crypto/signedFacts';
import keyHash from '../lib/crypto/keyHash';
import b64u from '../lib/crypto/b64u';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
import readDoc from './readDoc';
import type DocItem from '../types/DocItem';
import type EncryptedDoc from '../types/EncryptedDoc';
import sealedLocal from '../lib/sealedLocal/sealedLocal';

type Grant = { userId: string; wrappedKey: string };
type Audience = DocItem['audience'];

function identity() {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your docs first.');
  return id;
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

// Each field is signed by its author for this doc, field and version, together with who the
// version is for and which key protects it, then encrypted with the version in the additional data.
async function sealed(docKey: Uint8Array, docId: string, version: number, words: { title: string; body: string }, to: { audience: Audience; readers: (string | null)[] }) {
  const by = store.get().me!.id;
  const { signingPrivate } = identity();
  const facts: DocFacts = { audience: to.audience, readers: docFacts.readers([by, ...to.readers]), key: keyHash(docKey), at: Date.now() };
  const field = (f: DocPlace['field'], text: string) => {
    const at = { docId, field: f, version };
    return docText.seal(docKey, at, signedFacts.seal(text, { kind: docFacts.kind, place: docFacts.place(at), facts: docFacts.list(facts), by, signingPrivate }));
  };
  return { titleCt: await field('title', words.title || 'Untitled'), bodyCt: await field('body', words.body) };
}

// the pictures and files a body uses, so the server can let go of ones taken out (see docBlobRefs)
async function blobsIn(body: string) {
  const { default: docBlobRefs } = await import('../lib/docState/docBlobRefs');
  return docBlobRefs(body);
}

// Writing to a doc, or sharing it, uses the very key its version checked out with.
function writable(doc: DocItem, what: string) {
  if (doc.warning === 'unverified') throw new Error('Nil can’t confirm a teammate wrote this version, so it won’t write to it or share it under the same key.');
  const key = readDoc.keyOf(doc);
  if (!key) throw new Error(`Reopen the doc to ${what} it.`);
  return key;
}

const docs = {
  async list() {
    const res = await http.get<{ docs: EncryptedDoc[]; waiting: { id: string; createdBy: string | null; updatedAt: number }[] }>('/docs');
    const items = await Promise.all(res.docs.map((d) => readDoc.decrypt(d).catch(() => null)));
    return { docs: items.filter((d): d is DocItem => d !== null), waiting: res.waiting };
  },

  open: (id: string) => http.get<{ doc: EncryptedDoc }>(`/docs/${id}`).then((r) => readDoc.decrypt(r.doc)),

  // A team doc is sealed for everyone whose key this person has confirmed; the rest get it handed
  // over by a teammate's browser once confirmed there (see shareWithTeam).
  async create({ title, body, markdown, audience, people = [] }: { title: string; body?: string; markdown?: string; audience: Audience; people?: string[] }) {
    const me = store.get().me!;
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const docKey = crypto.getRandomValues(new Uint8Array(32));
    // agents never read docs: they hold no key, and guests don't get team docs
    const everyone = audience === 'team' ? Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent' && u.role !== 'guest').map((u) => u.id) : people;
    const grants = await sealFor(docKey, [me.id, ...everyone]);
    const readers = grants.map((g) => g.userId);
    // a new doc starts as shared editing state, with its title in it
    const { default: newDocBody } = await import('../lib/docState/newDocBody');
    const words = { title, body: body ?? newDocBody(title, markdown) };
    const res = await http.post<{ doc: EncryptedDoc }>('/docs', { id, audience, grants, blobs: await blobsIn(words.body), ...(await sealed(docKey, id, 1, words, { audience, readers })) });
    keyring.rememberDocKey(id, docKey);
    return readDoc.decrypt(res.doc);
  },

  // A save keeps the audience the version was signed for and names everyone who holds the key now.
  // `through` says how far into the live changes it reaches, so the server can fold those away.
  async save(doc: DocItem, title: string, body: string, { through }: { through?: number } = {}) {
    const key = writable(doc, 'save');
    const res = await http.put<{ doc: EncryptedDoc }>(`/docs/${doc.id}`, { baseVersion: doc.version, through, blobs: await blobsIn(body), ...(await sealed(key, doc.id, doc.version + 1, { title, body }, doc)) });
    return readDoc.decrypt(res.doc);
  },

  async share(doc: DocItem, userIds: string[]) {
    const key = writable(doc, 'share');
    const adding = userIds.filter((u) => !doc.readers.includes(u));
    await confirmKeys.ask(adding, 'this doc');
    const grants = await sealFor(key, adding);
    if (!grants.length) return doc.readers;
    return (await http.post<{ readers: string[] }>(`/docs/${doc.id}/grants`, { grants })).readers;
  },

  // Taking someone out means a new key for the doc, so a copy of the old one is worthless. It
  // also re-signs the text as yours, which is how a doc that failed its check gets a clean key.
  async restrict(doc: DocItem, keep: string[], audience: Audience) {
    const me = store.get().me!;
    await confirmKeys.ask(keep, 'this doc');
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    const grants = await sealFor(fresh, [me.id, ...keep]);
    const words = { title: doc.title, body: doc.body ?? '' };
    const to = { audience, readers: grants.map((g) => g.userId) };
    const res = await http.post<{ readers: string[] }>(`/docs/${doc.id}/rotate`, { baseVersion: doc.version, audience, grants, blobs: await blobsIn(words.body), ...(await sealed(fresh, doc.id, doc.version + 1, words, to)) });
    keyring.rememberDocKey(doc.id, fresh);
    return res.readers;
  },

  // Hands team docs to teammates who joined or unlocked after the doc was written, once this
  // person has confirmed their keys. Only a version signed as the team's counts, whatever the
  // server lists; never asks, never shares a doc that failed its check or can't say who it's for.
  async shareWithTeam(items: DocItem[]) {
    const people = Object.values(store.get().users).filter((u) => !u.deactivated && u.kind !== 'agent' && u.role !== 'guest').map((u) => u.id);
    const ready = new Set((await keyDirectory.sharable(people)).keys());
    for (const doc of items.filter((d) => d.audience === 'team' && !d.warning && !d.olderFormat)) {
      const missing = people.filter((u) => ready.has(u) && !doc.readers.includes(u));
      const key = readDoc.keyOf(doc);
      if (!missing.length || !key) continue;
      const grants = await sealFor(key, missing);
      if (grants.length) await http.post(`/docs/${doc.id}/grants`, { grants }).catch(() => {});
    }
  },

  async revisions(doc: DocItem) {
    const key = readDoc.keyOf(doc);
    if (!key) return [];
    const rows = await http.get<{ version: number; titleCt: string; bodyCt: string; updatedBy: string | null; createdAt: number }[]>(`/docs/${doc.id}/revisions`);
    // a version that can't be read is left out of the list instead of emptying it
    const read = await Promise.all(rows.map((r) => readDoc.revision(doc, key, r).catch(() => null)));
    return read.filter((r) => r !== null);
  },

  async remove(doc: DocItem) {
    await http.del(`/docs/${doc.id}`);
    keyring.forgetDocKey(doc.id);
    openedText.forgetDoc(doc.id);
    for (const name of await sealedLocal.names('doc-unsent', `${doc.id}:`)) await sealedLocal.remove('doc-unsent', name);
  },
};

export default docs;
