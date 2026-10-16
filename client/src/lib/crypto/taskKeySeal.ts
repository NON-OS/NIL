import sealedBox from './sealedBox';

// A private task's key, sealed to its creator or its assignee.
const taskKeySeal = sealedBox('nil/e2ee/task-key/v1');

export default taskKeySeal;
