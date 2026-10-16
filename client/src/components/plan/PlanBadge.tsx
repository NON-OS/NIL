import useStore from '../../state/useStore';
import planSummary from '../../lib/planSummary';

export default function PlanBadge() {
  const plan = useStore((s) => s.plan);
  const { tone, title } = planSummary(plan);
  return <span className={`plan-badge ${tone}`}>{title}</span>;
}
