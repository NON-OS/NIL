import { Fingerprint, KeyRound, Wallet } from 'lucide-react';

type Method = 'passkey' | 'password' | 'wallet';

const TABS: { id: Method; label: string; icon: typeof Fingerprint }[] = [
  { id: 'passkey', label: 'Passkey', icon: Fingerprint },
  { id: 'password', label: 'Password', icon: KeyRound },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

export default function MethodTabs({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="method-tabs" role="tablist" aria-label="How do you want to sign in?">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}>
          <Icon /> {label}
        </button>
      ))}
    </div>
  );
}
