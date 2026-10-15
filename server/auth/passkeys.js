import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import HttpError from '../lib/HttpError.js';

const fail = () => new HttpError(400, 'That passkey couldn’t be verified. Try again.');

// Thin wrapper over SimpleWebAuthn. Attestation is off on purpose: we don't want to know
// which device or vendor someone uses.
const passkeys = {
  registrationOptions({ rp, userId, userName, exclude = [] }) {
    return generateRegistrationOptions({
      rpName: rp.name,
      rpID: rp.rpID,
      userName,
      userDisplayName: userName,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials: exclude.map((c) => ({ id: c.external_id, transports: JSON.parse(c.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
  },

  async verifyRegistration({ rp, response, expectedChallenge }) {
    let result;
    try {
      result = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: false });
    } catch {
      throw fail();
    }
    if (!result.verified) throw fail();
    const { credential } = result.registrationInfo;
    return {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
    };
  },

  authenticationOptions({ rp }) {
    return generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'preferred' });
  },

  async verifyAuthentication({ rp, response, expectedChallenge, row }) {
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
        credential: { id: row.external_id, publicKey: new Uint8Array(Buffer.from(row.public_key, 'base64url')), counter: row.counter, transports: JSON.parse(row.transports) },
      });
    } catch {
      throw fail();
    }
    if (!result.verified) throw fail();
    return result.authenticationInfo.newCounter;
  },
};

export default passkeys;
