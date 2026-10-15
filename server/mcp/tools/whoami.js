import publicWorkspace from '../../services/publicWorkspace.js';

export default {
  name: 'whoami',
  title: 'Who am I',
  description: 'The NØNOS account this key belongs to, its role, and the workspace. Call this first to learn the task key prefix.',
  write: false,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: (args, user, scope) => ({ name: user.name, role: user.role, workspace: publicWorkspace().name, taskPrefix: publicWorkspace().taskPrefix, access: scope }),
};
