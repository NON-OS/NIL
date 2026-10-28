import NilLogo from '../brand/NilLogo';
import BrandArt from '../brand/BrandArt';
import Resolve from '../brand/Resolve';
import Arc from '../brand/Arc';

// What Nil does in plain words, each line something a careful reader could go and check.
const FACTS = [
  ['Encrypted in your browser', 'Private tasks, docs, chat, files and calls are encrypted end to end, with keys that come from your wallet. The server only ever stores and passes on scrambled bytes.'],
  ['Sign in with your wallet', 'No email, no password, no phone number. Signing in is free.'],
  ['Pay anyone for a task', 'Send a reward in NOX or USDC straight from your wallet to theirs. Nil checks it arrived and never holds the money.'],
  ['Decide together', 'Vote without anyone seeing how you voted. Only the totals come out.'],
];

export default function AuthPitch() {
  return (
    <aside className="auth-side">
      <Arc className="auth-arc" />
      <div className="auth-brand">
        <NilLogo height={44} />
        <span className="auth-by">
          by <BrandArt kind="logo" height={16} />
        </span>
      </div>
      <div className="auth-pitch">
        <span className="eyebrow">Tasks · Docs · Chat · Files · Calls · Votes</span>
        <h2>
          <Resolve text="The private task app for you and your team." />
        </h2>
        <ol className="auth-facts">
          {FACTS.map(([title, detail], i) => (
            <li key={title}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <b>{title}</b>
                <small>{detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <small className="eyebrow auth-foot">Source available · No trackers</small>
    </aside>
  );
}
