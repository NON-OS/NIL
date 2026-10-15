import BrandArt from '../brand/BrandArt';
import Resolve from '../brand/Resolve';
import Arc from '../brand/Arc';

// Plain, factual, checkable: what NØNOS does, with the actual primitives named.
const FACTS = [
  ['Sign in with an Ethereum wallet', 'No email, no password, no phone number.'],
  ['Docs encrypted in your browser', 'X25519 and AES-256-GCM. The server stores ciphertext.'],
  ['Bounties paid wallet to wallet', 'NOX goes straight to the contributor. The transfer is checked on-chain.'],
  ['Proof of work anyone can verify', 'Ed25519-signed receipts, checked offline in any browser.'],
];

export default function AuthPitch() {
  return (
    <aside className="auth-side">
      <Arc className="auth-arc" />
      <BrandArt kind="logo" height={44} />
      <div className="auth-pitch">
        <span className="eyebrow">Self-hosted workspace · v3</span>
        <h2>
          <Resolve text="Private work your team can prove." />
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
      <small className="eyebrow auth-foot">AGPL-3.0 · No trackers · No third-party requests</small>
    </aside>
  );
}
