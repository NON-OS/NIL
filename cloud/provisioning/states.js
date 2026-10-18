// Workspace states and what each one means for routing and background jobs.
//
//   provisioning  being created for the first time
//   starting      being started again after a stop, suspension or cancelled deletion
//   active        running; health checks, usage and backups apply
//   stopped       stopped by the operator, data kept
//   suspended     stopped by the operator for a reason (abuse, non-payment of an agreement)
//   upgrading     moving to a new image, or rolling back to the checkpoint
//   restoring     its data is being replaced from a backup
//   deleting      stopped and waiting out the grace period, after a final encrypted export
//   deleted       gone; the row only keeps the name in quarantine for a while
//   failed        something went wrong that needs the operator; data kept
const states = Object.freeze({
  // reachable through Caddy: the workspace is up or about to be
  routed: Object.freeze(['provisioning', 'starting', 'active', 'upgrading', 'restoring']),
  // answered with a short "not available" page instead
  paused: Object.freeze(['stopped', 'suspended', 'deleting', 'failed']),
  // states a background job may leave alone because an operation is under way
  busy: Object.freeze(['provisioning', 'starting', 'upgrading', 'restoring']),
  // the reasons the control plane suspends a workspace by itself, each with its own notice
  reasons: Object.freeze({ idle: 'automatic: unused', disk: 'automatic: over its disk' }),
});

export default states;
