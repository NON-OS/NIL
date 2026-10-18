import signedText, { type Signed } from './signedText';

// From format 2 on, text is signed together with the facts it was written for: where it belongs,
// who may read it, which key protects it and when it was written. `kind` is a nil/.../v2 name for
// the sort of thing it is, `place` is where the reader expects it, and the facts travel next to
// the text. All of it goes into the signature as one JSON list, so nothing can be read two ways.
const context = (kind: string, place: unknown[], facts: unknown[]) => `${kind}\n${JSON.stringify([...place, ...facts])}`;

const signedFacts = {
  seal(text: string, { kind, place, facts, by, signingPrivate }: { kind: string; place: unknown[]; facts: unknown[]; by: string; signingPrivate: Uint8Array }) {
    const signed = JSON.parse(signedText.seal(text, { context: context(kind, place, facts), by, signingPrivate }));
    return JSON.stringify({ ...signed, v: 2, facts });
  },

  // The signed text and its facts. Text from before format 2 has no facts, and its signature
  // only ever checks under the older context, never under this one.
  open(json: string): { signed: Signed; facts: unknown[] | null } {
    const signed = signedText.open(json);
    const value = JSON.parse(json) as { v?: unknown; facts?: unknown };
    if (value.v === undefined) return { signed, facts: null };
    if (value.v !== 2 || !Array.isArray(value.facts)) throw new Error('This was saved in a format Nil doesn’t know.');
    return { signed, facts: value.facts };
  },

  verify: (signed: Signed, { kind, place, facts }: { kind: string; place: unknown[]; facts: unknown[] }, signingKey: Uint8Array) => signedText.verify(signed, context(kind, place, facts), signingKey),
};

export default signedFacts;
