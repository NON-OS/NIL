import b64u from '../crypto/b64u';

const HEADER = 'nil-doc/3\n';

// A doc's body as it's signed and encrypted. From Docs v2 on it's the doc's whole shared state
// (Yjs), base64url after a one-line header; before that it was Markdown text, which still opens.
const docBody = {
  isRich: (body: string | null | undefined): body is string => typeof body === 'string' && body.startsWith(HEADER),
  encode: (state: Uint8Array) => HEADER + b64u.encode(state),
  decode: (body: string) => b64u.decode(body.slice(HEADER.length)),
};

export default docBody;
