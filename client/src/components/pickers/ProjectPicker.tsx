import { useMemo, type ReactNode } from 'react';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';

interface Props {
  value: string | null;
  onChange: (projectId: string | null) => void;
  children: ReactNode;
  className?: string;
}

const swatch = (color: string) => <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: 'none' }} />;

export default function ProjectPicker({ value, onChange, children, className }: Props) {
  const projects = useStore((s) => s.projects);
  const options = useMemo(
    () => [
      { value: '', label: 'No project', icon: swatch('var(--line-strong)') },
      ...Object.values(projects)
        .filter((p) => !p.archived || p.id === value)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ value: p.id, label: p.name, icon: swatch(p.color), hint: p.key })),
    ],
    [projects, value],
  );

  return (
    <Picker title="Move to project" placeholder="Project…" options={options} value={value ?? ''} onChange={(v) => onChange(v || null)} className={className}>
      {children}
    </Picker>
  );
}
