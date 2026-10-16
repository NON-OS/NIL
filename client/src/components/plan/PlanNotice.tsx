import './Plan.css';
import useStore from '../../state/useStore';
import router from '../../lib/router';
import isAdminUser from '../../lib/isAdmin';

// Shown above a paid tool while the subscription is paused, so nobody meets a bare error.
export default function PlanNotice({ what }: { what: string }) {
  const unlocked = useStore((s) => s.plan.unlocked);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  if (unlocked) return null;
  return (
    <div className="plan-notice" role="status">
      <span>
        <strong>{what} need Nil Pro.</strong> Everything already here stays readable.
        {!isAdmin && ' An admin can renew it.'}
      </span>
      {isAdmin && (
        <a className="btn btn-sm" href="/settings?tab=plan" onClick={router.link('/settings?tab=plan')}>
          Renew plan
        </a>
      )}
    </div>
  );
}
