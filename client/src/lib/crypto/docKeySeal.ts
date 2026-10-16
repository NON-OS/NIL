import sealedBox from './sealedBox';

// A doc's key, sealed to one reader.
const docKeySeal = sealedBox('nonos/e2ee/doc-key/v1');

export default docKeySeal;
