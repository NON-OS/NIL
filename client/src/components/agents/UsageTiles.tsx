import formatUsage from './formatUsage';
import type AgentUsage from '../../types/AgentUsage';

// Usage at a glance: tokens and the estimated cost of built-in runs, and calls from outside.
export default function UsageTiles({ usage, builtIn }: { usage: AgentUsage; builtIn: boolean }) {
  const tiles = builtIn
    ? [
        [formatUsage.tokens(usage.today.input + usage.today.output), 'tokens today'],
        [formatUsage.cost(usage.today.cost), 'estimated cost today'],
        [formatUsage.tokens(usage.last30Days.input + usage.last30Days.output), 'tokens, 30 days'],
        [formatUsage.cost(usage.last30Days.cost), 'estimated cost, 30 days'],
        [String(usage.last30Days.runs), `runs, 30 days${usage.last30Days.failed ? ` (${usage.last30Days.failed} failed)` : ''}`],
      ]
    : [
        [String(usage.today.apiCalls), 'API calls today'],
        [String(usage.last30Days.apiCalls), 'API calls, 30 days'],
      ];
  return (
    <div className="agent-usage">
      {tiles.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
