import useStore from '../../state/useStore';

export default function LabelChips({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const labels = useStore((s) => s.labels);
  const known = ids.map((id) => labels[id]).filter(Boolean);
  if (!known.length) return null;
  return (
    <>
      {known.slice(0, max).map((l) => (
        <span key={l.id} className="chip">
          <span className="dot" style={{ background: l.color }} />
          {l.name}
        </span>
      ))}
      {known.length > max && <span className="chip">+{known.length - max}</span>}
    </>
  );
}
