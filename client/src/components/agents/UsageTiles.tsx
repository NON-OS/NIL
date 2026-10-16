import formatUsage from './formatUsage';
import type AgentUsage from '../../types/AgentUsage';

// Usage at a glance: tokens and, once the agent has prices, the estimated cost of built-in runs;
// calls from outside for external agents.
export default function UsageTiles({ usage, builtIn }: { usage: AgentUsage; builtIn: boolean }) {
  const priced = usage.today.cost !== null && usage.last30Days.cost !== null;
  const tiles = builtIn
    ? [
        [formatUsage.tokens(usage.today.input + usage.today.output), 'tokens today'],
        ...(priced ? [[formatUsage.cost(usage.today.cost ?? 0), 'estimated cost today']] : []),
        [formatUsage.tokens(usage.last30Days.input + usage.last30Days.output), 'tokens, 30 days'],
        ...(priced ? [[formatUsage.cost(usage.last30Days.cost ?? 0), 'estimated cost, 30 days']] : []),
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
