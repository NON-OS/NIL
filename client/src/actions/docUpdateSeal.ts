import { utf8ToBytes } from '@noble/hashes/utils';
import store from '../state/store';
import keyring from '../state/keyring';
import signedFacts from '../lib/crypto/signedFacts';
import docLiveCipher from '../lib/crypto/docLiveCipher';
import docUpdateFacts from '../lib/crypto/docUpdateFacts';
import keyHash from '../lib/crypto/keyHash';
import b64u from '../lib/crypto/b64u';
import keyDirectory from './keyDirectory';
import type OpenedUpdate from '../types/OpenedUpdate';

// how far a change's signed time may be from when the server took it
const SKEW_MS = 10 * 60_000;

// Live changes to a doc: signed by whoever made them, for this doc, this change and this key,
// then sealed with the doc key. Opening one checks all of that again.
const docUpdateSeal = {
  async seal(docId: string, key: Uint8Array, update: Uint8Array) {
    const id = keyring.identity();
    if (!id) throw new Error('Unlock your docs first.');
    const changeId = docLiveCipher.newId();
    const facts = { key: keyHash(key), at: Date.now() };
    const json = signedFacts.seal(b64u.encode(update), { kind: docUpdateFacts.kind, place: docUpdateFacts.place(docId, changeId), facts: docUpdateFacts.list(facts), by: store.get().me!.id, signingPrivate: id.signingPrivate });
    return { id: changeId, ct: await docLiveCipher.seal(key, docId, 'update', changeId, utf8ToBytes(json)) };
  },

  // `readers` are the people holding the doc's key. A change signed by anyone else, under another
  // key, or with a signature that doesn't check out against a key this person can see for its
  // author, comes back unverified and is never applied. So does one whose signed time is far from
  // `receivedAt`, when the server took it: a replaced key can't sign changes dated back to when it
  // still counted.
  async open(docId: string, key: Uint8Array, ct: string, readers: string[], receivedAt?: number): Promise<OpenedUpdate> {
    const { id, payload } = await docLiveCipher.open(key, docId, 'update', ct);
    const { signed, facts } = signedFacts.open(new TextDecoder().decode(payload));
    if (!facts) return { id, update: new Uint8Array(), by: signed.by, verified: false };
    const f = docUpdateFacts.parse(facts);
    const statement = { kind: docUpdateFacts.kind, place: docUpdateFacts.place(docId, id), facts: docUpdateFacts.list(f) };
    const timely = receivedAt === undefined || Math.abs(f.at - receivedAt) <= SKEW_MS;
    const fits = f.key === keyHash(key) && readers.includes(signed.by) && timely;
    const author = fits ? await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)) : null;
    return { id, update: b64u.decode(signed.text), by: signed.by, verified: Boolean(author) };
  },
};

export default docUpdateSeal;
