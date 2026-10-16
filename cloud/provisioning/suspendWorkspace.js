import haltWorkspace from './haltWorkspace.js';

// Takes a workspace offline without touching its data, for example over abuse. Visitors see a
// short "not available" page; `resume` brings it back exactly as it was.
export default function suspendWorkspace(ctx, id, reason = 'operator') {
  return haltWorkspace(ctx, id, {
    from: ['active', 'stopped', 'failed'],
    to: 'suspended',
    fields: { suspendedAt: ctx.store.now(), suspendReason: String(reason).slice(0, 200) },
    event: 'suspended',
  });
}
