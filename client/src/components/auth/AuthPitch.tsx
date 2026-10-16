import NilLogo from '../brand/NilLogo';
import BrandArt from '../brand/BrandArt';
import Resolve from '../brand/Resolve';
import Arc from '../brand/Arc';

// What Nil does in plain words, each line something a careful reader could go and check.
const FACTS = [
  ['Encrypted in your browser', 'Private tasks and docs are locked with keys from your wallet. The server only ever stores scrambled text.'],
  ['Sign in with your wallet', 'No email, no password, no phone number.'],
  ['Pay anyone for a task', 'NOX or USDC goes wallet to wallet and is checked on-chain. Nil never holds the money.'],
  ['Decide together', 'Anonymous votes weighted by NOX and Zero-State Passes. Only the totals come out.'],
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
        <span className="eyebrow">Tasks · Docs · Payments · Votes</span>
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
      <small className="eyebrow auth-foot">Open source · AGPL-3.0 · No trackers</small>
    </aside>
  );
}
