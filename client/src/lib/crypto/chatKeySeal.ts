import sealedBox from './sealedBox';

// A chat epoch's key, sealed to one member.
const chatKeySeal = sealedBox('nil/e2ee/chat-key/v1');

export default chatKeySeal;
