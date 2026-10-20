import './Plan.css';
import useStore from '../../state/useStore';
import router from '../../lib/router';
import isAdminUser from '../../lib/isAdmin';
import HelpLink from '../help/HelpLink';

// Shown above a paid tool while the subscription is paused, so nobody meets a bare error.
export default function PlanNotice({ what }: { what: string }) {
  const unlocked = useStore((s) => s.plan.unlocked);
  const overSeats = useStore((s) => s.plan.overSeats);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  if (unlocked) return null;
  return (
    <div className="plan-notice" role="status">
      <span>
        <strong>{overSeats ? `${what} are paused: more people are here than the seats paid for.` : `${what} need Nil Pro.`}</strong> Everything already here stays readable.
        {!isAdmin && (overSeats ? ' An admin can add seats.' : ' An admin can renew it.')} <HelpLink topic="nox-and-nil-pro" label="What Nil Pro covers" />
      </span>
      {isAdmin && (
        <a className="btn btn-sm" href="/settings?tab=plan" onClick={router.link('/settings?tab=plan')}>
          {overSeats ? 'Add seats' : 'Renew plan'}
        </a>
      )}
    </div>
  );
}
