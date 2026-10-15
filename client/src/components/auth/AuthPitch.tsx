import Wordmark from '../ui/Wordmark';
import StatusIcon from '../ui/StatusIcon';

export default function AuthPitch() {
  return (
    <aside className="auth-side">
      <Wordmark size={22} inverted />
      <div>
        <h2>Plan the work. Ship the work. Grow.</h2>
        <p>Tasks, goals and verifiable proof of contribution for your team, on a server you control.</p>
        <div className="auth-flow" aria-hidden="true">
          <div><StatusIcon status="todo" size={16} /> Draft the Q3 growth plan</div>
          <div><StatusIcon status="in_progress" size={16} /> Launch referral program</div>
          <div><StatusIcon status="done" size={16} /> Hire first sales lead</div>
        </div>
      </div>
      <small style={{ opacity: 0.7 }}>Self-hosted, open source, no trackers. Sign in with your Ethereum wallet. No email, no password.</small>
    </aside>
  );
}
