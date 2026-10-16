import crypto from 'node:crypto';

// 64 random bits in lowercase hex. The id names the container, its network and its volume, so
// it has to be a valid DNS label for Docker's resolver and carry nothing about the workspace.
export default function newWorkspaceId() {
  return crypto.randomBytes(8).toString('hex');
}
