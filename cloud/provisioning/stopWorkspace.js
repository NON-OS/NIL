import haltWorkspace from './haltWorkspace.js';

export default function stopWorkspace(ctx, id) {
  return haltWorkspace(ctx, id, { from: ['active', 'failed'], to: 'stopped', event: 'stopped' });
}
