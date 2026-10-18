import keyring from '../state/keyring';
import openedText from '../state/openedText';
import docVersions from '../state/docVersions';
import docKeySeal from '../lib/crypto/docKeySeal';
import docText, { type DocPlace } from '../lib/crypto/docText';
import docFacts, { type DocFacts } from '../lib/crypto/docFacts';
import signedText from '../lib/crypto/signedText';
import signedFacts from '../lib/crypto/signedFacts';
import keyHash from '../lib/crypto/keyHash';
import keyDirectory from './keyDirectory';
import type DocItem from '../types/DocItem';
import type EncryptedDoc from '../types/EncryptedDoc';

interface Field {
  text: string;
  by: string;
  facts: DocFacts | null;
  verified: boolean;
  old: string | null;
}

// Opens one field and checks it. From format 2 on, whoever saved it has to be one of the readers
// they signed it for, the key it opened with has to be the one they signed, and their signature
// has to check out against a key this person can see for them. An older field names only its
// author, who has to be the one the server names too.
async function openField(key: Uint8Array, at: DocPlace, blob: string, updatedBy: string | null): Promise<Field> {
  const { signed, facts } = signedFacts.open(await docText.open(key, at, blob));
  if (!facts) {
    const author = signed.by === updatedBy ? await keyDirectory.author(signed.by, null, (k) => signedText.verify(signed, docText.context(at), k)) : null;
    return { text: signed.text, by: signed.by, facts: null, verified: Boolean(author), old: null };
  }
  const f = docFacts.parse(facts);
  const statement = { kind: docFacts.kind, place: docFacts.place(at), facts: docFacts.list(f) };
  const fits = f.readers.includes(signed.by) && f.key === keyHash(key);
  const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)) : null;
  return { text: signed.text, by: signed.by, facts: f, verified: Boolean(author), old: author?.old ?? null };
}

// One version's title and body, which have to be signed by the same person with the same facts.
async function openVersion(key: Uint8Array, docId: string, version: number, cts: { titleCt: string; bodyCt?: string }, updatedBy: string | null) {
  const at = (field: DocPlace['field']) => ({ docId, field, version });
  const title = await openField(key, at('title'), cts.titleCt, updatedBy);
  const body = cts.bodyCt ? await openField(key, at('body'), cts.bodyCt, updatedBy) : null;
  const alike = !body || (body.by === title.by && JSON.stringify(body.facts) === JSON.stringify(title.facts));
  const verified = title.verified && (body?.verified ?? true) && alike;
  return { title: title.text, body: body?.text ?? null, verified, facts: verified ? title.facts : null, olderFormat: !title.facts, by: verified && title.facts ? title.by : updatedBy, oldKey: title.old ?? body?.old ?? null };
}

function unwrap(doc: EncryptedDoc) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your docs first.');
  return docKeySeal.open(doc.wrappedKey, id.privateKey, id.publicKey);
}

// Decrypts docs and checks who wrote each version and who it's for. Only a key that opened a
// version which checked out is kept for writing under.
const readDoc = {
  async decrypt(doc: EncryptedDoc): Promise<DocItem> {
    const cached = keyring.docKey(doc.id);
    let key = cached ?? (await unwrap(doc));
    let v;
    try {
      v = await openVersion(key, doc.id, doc.version, doc, doc.updatedBy);
    } catch (err) {
      // the doc may have moved to a new key since this tab last opened it
      if (!cached) throw err;
      key = await unwrap(doc);
      v = await openVersion(key, doc.id, doc.version, doc, doc.updatedBy);
    }
    if (v.verified) keyring.rememberDocKey(doc.id, key);
    const item: DocItem = {
      id: doc.id,
      title: v.title,
      body: v.body,
      version: doc.version,
      audience: v.facts?.audience ?? doc.audience,
      createdBy: doc.createdBy,
      updatedBy: v.by,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      readers: doc.readers,
      warning: !v.verified ? 'unverified' : docVersions.check(doc.id, doc.version) === 'rollback' ? 'rollback' : null,
      olderFormat: v.olderFormat,
      oldKey: v.oldKey,
      keyHash: keyHash(key),
    };
    // so search in this tab can find it, for as long as the keys stay unlocked
    openedText.rememberDoc(item);
    return item;
  },

  // The doc key a version was opened and checked with, or null when this tab holds another.
  keyOf(doc: DocItem) {
    const key = keyring.docKey(doc.id);
    return key && keyHash(key) === doc.keyHash ? key : null;
  },

  async revision(doc: DocItem, key: Uint8Array, r: { version: number; titleCt: string; bodyCt: string; updatedBy: string | null; createdAt: number }) {
    const v = await openVersion(key, doc.id, r.version, r, r.updatedBy);
    return { version: r.version, updatedBy: v.by, createdAt: r.createdAt, title: v.title, body: v.body ?? '', verified: v.verified, olderFormat: v.olderFormat, oldKey: v.oldKey };
  },
};

export default readDoc;
