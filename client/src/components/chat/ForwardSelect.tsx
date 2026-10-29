// How long a forward-secret conversation keeps its old keys, as the menu offers it.
const CHOICES: [string, number | null][] = [
  ['Keep old keys', null],
  ['1 day', 1],
  ['7 days', 7],
  ['30 days', 30],
  ['90 days', 90],
];

export default function ForwardSelect({ value, onChange, disabled = false }: { value: number | null; onChange: (days: number | null) => void; disabled?: boolean }) {
  return (
    <label className="field">
      <span>Forward secrecy</span>
      <select className="input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        {CHOICES.map(([label, days]) => (
          <option key={label} value={days ?? ''}>
            {label}
          </option>
        ))}
      </select>
      <small>Old keys, and the messages sealed under them, are deleted from the server and every browser this long after their key was replaced. Someone who later steals a member’s keys can’t read them. People who join can read back only that far.</small>
    </label>
  );
}
