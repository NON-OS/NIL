import b64u from './crypto/b64u';

// WebAuthn's PRF extension, which TypeScript's DOM types don't describe yet.
interface PrfValues {
  first: Uint8Array;
}
interface PrfInputs {
  prf: { eval?: PrfValues; evalByCredential?: Record<string, PrfValues> };
}
interface PrfOutputs {
  prf?: { results?: { first?: unknown } };
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const CANCELLED = 'The passkey request was cancelled or timed out. Try again when you’re ready.';
// at unlock, no answer can also mean none of your passkeys works at this address
const NO_PASSKEY = 'No passkey was used. Try again, or unlock with your wallet. A passkey only works at the web address it was made on.';

function friendly(err: unknown, cancelled = CANCELLED) {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error(cancelled);
  if (name === 'SecurityError') return new Error('Passkeys can’t be used at this site’s address.');
  if (name === 'NotSupportedError') return new Error('This browser or passkey manager can’t make a passkey that works here.');
  return err instanceof Error ? err : new Error('Your passkey manager returned an error.');
}

function supported() {
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) throw new Error('This browser doesn’t support passkeys.');
}

// The PRF output in the credential's extension results, or null when there is none. The
// capability flags in those results don't count: only an actual output does.
function outputOf(credential: PublicKeyCredential) {
  const first = (credential.getClientExtensionResults() as PrfOutputs).prf?.results?.first;
  const bytes = first instanceof ArrayBuffer ? new Uint8Array(first) : ArrayBuffer.isView(first) ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength) : null;
  return bytes?.length === 32 ? bytes : null;
}

async function ask(allow: string[], prf: PrfInputs['prf'], cancelled?: string) {
  supported();
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: allow.map((id) => ({ type: 'public-key', id: b64u.decode(id) })),
        userVerification: 'required',
        extensions: { prf } as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (err) {
    throw friendly(err, cancelled);
  }
  if (!(credential instanceof PublicKeyCredential)) throw new Error(cancelled ?? CANCELLED);
  return { credentialId: b64u.encode(new Uint8Array(credential.rawId)), output: outputOf(credential) };
}

// Passkeys for this site, used only for their PRF output: the server never checks a passkey's
// signature, since signing in stays with the wallet. Each call asks for user verification.
const passkeyPrf = {
  // A new passkey, discoverable where the passkey manager allows it. Returns its credential id.
  async create(user: { name: string; displayName: string }) {
    supported();
    let credential: Credential | null;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          rp: { id: location.hostname, name: 'Nil' },
          user: { id: random(32), name: user.name, displayName: user.displayName },
          challenge: random(32),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
          extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
        },
      });
    } catch (err) {
      throw friendly(err);
    }
    if (!(credential instanceof PublicKeyCredential)) throw new Error('No passkey was made.');
    return b64u.encode(new Uint8Array(credential.rawId));
  },

  // One passkey's PRF output for one salt.
  async evaluate(credentialId: string, salt: Uint8Array) {
    const answer = await ask([credentialId], { eval: { first: salt } });
    if (answer.credentialId !== credentialId) {
      answer.output?.fill(0);
      throw new Error('A different passkey answered.');
    }
    return answer.output;
  },

  // Whichever of these passkeys the person uses answers, each with its own salt.
  evaluateAny: (salts: { credentialId: string; salt: Uint8Array }[]) =>
    ask(
      salts.map((s) => s.credentialId),
      { evalByCredential: Object.fromEntries(salts.map((s) => [s.credentialId, { first: s.salt }])) },
      NO_PASSKEY,
    ),
};

export default passkeyPrf;
