import crypto from 'node:crypto';
import { Identity } from '@semaphore-protocol/identity';

// The app's own key, trustee, ballot and tally code is TypeScript; it loads the way the tests load it.
await import('../../test/registerTs.mjs');
const lib = async (name) => (await import(`../../../client/src/lib/${name}.ts`)).default;
const [identityFromSeed, privateKeysFromSeed, b64u, verifyKeyStatement, commitDealing, dealingLine, dealShares, trusteeStatement, trusteeSignature, checkShares, votePublicKey, checkVoterList, verifyBallots, partialDecryption] = await Promise.all(
  ['crypto/identityFromSeed', 'crypto/privateKeysFromSeed', 'crypto/b64u', 'crypto/verifyKeyStatement', 'ballot/commitDealing', 'ballot/dealingLine', 'ballot/dealShares', 'ballot/trusteeStatement', 'ballot/trusteeSignature', 'ballot/checkShares', 'ballot/votePublicKey', 'semaphore/checkVoterList', 'ballot/verifyBallots', 'ballot/partialDecryption'].map(lib),
);

const proposalOf = async (api, id) => (await api.get('/proposals')).find((p) => p.id === id);

// One member's browser in an encrypted vote, doing what client/src/actions/trusteeSetup.ts and
// encryptedVotes.ts do, step by step, through the same API and the same library code: an
// identity made from a seed, every trustee step signed with its signing key, every other
// trustee's signature checked against the keys the directory lists for them, and a trustee
// that checks and adds up the ballots itself before it decrypts anything.
export default async function trusteeBrowser(person) {
  const seed = crypto.randomBytes(32);
  const identity = identityFromSeed(seed);
  const semaphore = new Identity(privateKeysFromSeed(seed).semaphoreSecret);
  const userId = person.id;

  // the signing key the directory lists for each seat's trustee, once its wallet signature checks out
  async function signers(trustees) {
    const { origin, workspaceKey } = await person.api.get('/bootstrap');
    const keys = new Map((await person.api.get('/encryption-keys')).filter((k) => verifyKeyStatement(k, { origin, workspaceKey })).map((k) => [k.userId, k]));
    return trustees.map((t) => (keys.get(t.userId) ? { userId: t.userId, signingKey: b64u.decode(keys.get(t.userId).signingKey), publicKey: b64u.decode(keys.get(t.userId).publicKey) } : null));
  }
  const seatIn = (vote) => vote.encrypted.trustees.find((t) => t.userId === userId).position;

  return {
    identity,
    semaphore,
    publicKey: b64u.encode(identity.publicKey),
    signingKey: b64u.encode(identity.signingKey),

    async commit(voteId) {
      const vote = await proposalOf(person.api, voteId);
      const position = seatIn(vote);
      const commitment = commitDealing(seed, voteId, position);
      await person.api.put(`/proposals/${voteId}/commitment`, { commitment, signature: trusteeSignature.sign(trusteeStatement.commit(voteId, position, userId, commitment), identity.signingPrivate) });
    },

    async reveal(voteId) {
      const vote = await proposalOf(person.api, voteId);
      const position = seatIn(vote);
      const recipients = (await signers(vote.encrypted.trustees)).map((s, i) => ({ position: i + 1, publicKey: s.publicKey }));
      const dealing = await dealShares(voteId, position, dealingLine(seed, voteId, position), recipients);
      const signature = trusteeSignature.sign(trusteeStatement.reveal(voteId, position, userId, dealing.commitments, trusteeStatement.sharesDigest(dealing.shares)), identity.signingPrivate);
      await person.api.put(`/proposals/${voteId}/dealing`, { ...dealing, signature });
    },

    // the dealings must be the trustees' own and the shares sealed here must match them
    async checkShares(voteId) {
      const vote = await proposalOf(person.api, voteId);
      const result = await checkShares(voteId, seatIn(vote), vote.encrypted.dealings, identity, { signers: await signers(vote.encrypted.trustees) });
      if (!result.ok) throw new Error(`trustee ${result.from}'s share didn't match their commitments`);
      await person.api.post(`/proposals/${voteId}/shares-check`, { ok: true });
    },

    // A ballot as the browser casts one: the voter list fetched without the cookie and checked
    // against the signed-in view, the key rebuilt from the trustees' signed dealings, and the
    // ballot sent without the cookie. `prove` makes the proof from what was checked.
    async cast(base, voteId, choice, prove) {
      const signedIn = await proposalOf(person.api, voteId);
      const trusted = await signers(signedIn.encrypted.trustees);
      const view = await (await fetch(`${base}/api/anonymous-votes/${voteId}`, { headers: { 'X-NONOS': '1' } })).json();
      checkVoterList(view, signedIn.anonymous.roots, true);
      const key = votePublicKey(view.id, view.encrypted.commitments, trusted);
      if (!key || key.join() !== view.encrypted.publicKey.join()) throw new Error('the vote key isn’t the one the trustees signed for');
      const res = await fetch(`${base}/api/anonymous-ballots/${voteId}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(await prove(semaphore, view, choice, key)) });
      if (res.status !== 200) throw new Error(`ballot refused: ${res.status} ${await res.text()}`);
    },

    // After the close: every ballot checked and added up here, and only those sums decrypted.
    async decrypt(voteId) {
      const vote = await proposalOf(person.api, voteId);
      const trusted = await signers(vote.encrypted.trustees);
      const key = votePublicKey(voteId, vote.encrypted.commitments, trusted);
      if (!key || key.join() !== vote.encrypted.publicKey.join()) throw new Error('the vote key isn’t the one the trustees signed for');
      const { ballots, roots } = await person.api.get(`/proposals/${voteId}/ballots`);
      if (ballots.length !== vote.voters) throw new Error('the server sent a different number of ballots from its count');
      const sums = await verifyBallots({ id: voteId, optionCount: vote.options.length, publicKey: key, roots }, ballots, vote.encrypted.aggregates);
      await person.api.post(`/proposals/${voteId}/partial`, await partialDecryption(voteId, seatIn(vote), vote.encrypted.dealings, sums, identity, { signers: trusted }));
    },
  };
}
