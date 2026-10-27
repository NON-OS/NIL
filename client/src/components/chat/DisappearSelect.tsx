// How long messages stay in a conversation, as the menu offers it.
const CHOICES: [string, number | null][] = [
  ['Keep messages', null],
  ['1 hour', 3600],
  ['1 day', 86_400],
  ['7 days', 7 * 86_400],
  ['30 days', 30 * 86_400],
  ['90 days', 90 * 86_400],
];

export default function DisappearSelect({ value, onChange, disabled = false }: { value: number | null; onChange: (seconds: number | null) => void; disabled?: boolean }) {
  return (
    <label className="field">
      <span>Disappearing messages</span>
      <select className="input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        {CHOICES.map(([label, seconds]) => (
          <option key={label} value={seconds ?? ''}>
            {label}
          </option>
        ))}
      </select>
      <small>New messages disappear this long after they’re sent, for everyone, on the server and in every browser.</small>
    </label>
  );
}
