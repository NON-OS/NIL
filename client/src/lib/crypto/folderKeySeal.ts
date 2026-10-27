import sealedBox from './sealedBox';

// A shared folder's key, sealed to one reader, the same way a doc key is.
const folderKeySeal = sealedBox('nil/e2ee/folder-key/v1');

export default folderKeySeal;
