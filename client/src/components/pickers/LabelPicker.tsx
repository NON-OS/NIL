import { useMemo, type ReactNode } from 'react';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';
import labelActions from '../../actions/labels';

interface Props {
  value: string[];
  onChange: (labelIds: string[]) => void;
  children: ReactNode;
  className?: string;
}

export default function LabelPicker({ value, onChange, children, className }: Props) {
  const labels = useStore((s) => s.labels);
  const options = useMemo(
    () =>
      Object.values(labels)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => ({ value: l.id, label: l.name, icon: <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flex: 'none' }} /> })),
    [labels],
  );
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <Picker
      title="Labels"
      placeholder="Find or create a label…"
      multi
      options={options}
      value={value}
      onChange={toggle}
      className={className}
      onCreate={async (name) => {
        const label = await labelActions.create(name);
        if (label) onChange([...value, label.id]);
      }}
      createLabel={(q) => `Create label “${q}”`}
    >
      {children}
    </Picker>
  );
}
