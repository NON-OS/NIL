import units from '../config/units.js';

const GB = 1024 * units.MB;

// What to tell someone whose write didn't fit in the workspace's storage.
export default function storageFull(quota) {
  const size = quota >= GB ? `${Math.round(quota / GB)} GB` : `${Math.round(quota / units.MB)} MB`;
  return `This workspace has used its ${size} of storage. Delete files or docs you no longer need, or ask whoever runs the server for more.`;
}
