import sealedBox from '../crypto/sealedBox';

// The team's pool key, sealed to one admin's encryption key.
const poolKeySeal = sealedBox('nil/privacy-pools/account-key/v1');

export default poolKeySeal;
