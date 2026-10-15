import meta from '../../lib/meta';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorSwatches({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="Color">
      {meta.palette.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.value}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(c.value)}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 0,
            background: c.value,
            boxShadow: value.toLowerCase() === c.value ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.value}` : 'none',
          }}
        />
      ))}
    </div>
  );
}
