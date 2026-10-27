import store from '../state/store';
import keyring from '../state/keyring';
import signedFacts from '../lib/crypto/signedFacts';
import docCommentFacts from '../lib/crypto/docCommentFacts';
import factChecks from '../lib/crypto/factChecks';
import keyDirectory from './keyDirectory';

export interface SignedMessage {
  id: string;
  by: string;
  at: number;
  text: string;
  sig?: string;
}

const statement = (docId: string, threadId: string, m: SignedMessage, quote: string) => ({
  kind: docCommentFacts.kind,
  place: docCommentFacts.place(docId, threadId, m.id),
  facts: docCommentFacts.list({ at: m.at, quote }),
});

// Comment messages live inside the doc, so any reader could write one under someone else's name.
// Each is signed by its author for this doc, thread and message; one that doesn't check out
// against a key this person can see for the name on it is never shown as theirs.
const docCommentSeal = {
  sign(docId: string, threadId: string, m: Omit<SignedMessage, 'by' | 'sig'>, quote: string): SignedMessage {
    const id = keyring.identity();
    const by = store.get().me?.id;
    if (!id || !by) throw new Error('Unlock your docs first.');
    const message = { ...m, by };
    const { kind, place, facts } = statement(docId, threadId, message, quote);
    const { sig } = JSON.parse(signedFacts.seal(m.text, { kind, place, facts, by, signingPrivate: id.signingPrivate })) as { sig: string };
    return { ...message, sig };
  },

  async verify(docId: string, threadId: string, m: SignedMessage, quote: string) {
    if (typeof m.sig !== 'string' || !factChecks.person(m.by) || !factChecks.time(m.at)) return false;
    const signed = { by: m.by, text: m.text, sig: m.sig };
    const facts = statement(docId, threadId, m, quote);
    return Boolean(await keyDirectory.author(m.by, m.at, (k) => signedFacts.verify(signed, facts, k)));
  },
};

export default docCommentSeal;
