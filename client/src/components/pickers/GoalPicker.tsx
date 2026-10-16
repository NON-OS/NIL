import { useMemo, type ReactNode } from 'react';
import { Target } from 'lucide-react';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';

interface Props {
  value: string | null;
  onChange: (goalId: string | null) => void;
  children: ReactNode;
  className?: string;
}

export default function GoalPicker({ value, onChange, children, className }: Props) {
  const goals = useStore((s) => s.goals);
  const options = useMemo(
    () => [
      { value: '', label: 'No goal' },
      ...Object.values(goals)
        .sort((a, b) => a.position - b.position)
        .map((g) => ({ value: g.id, label: g.title, icon: <Target size={14} /> })),
    ],
    [goals],
  );

  return (
    <Picker title="Link to goal" placeholder="Goal…" options={options} value={value ?? ''} onChange={(v) => onChange(v || null)} className={className} width={280}>
      {children}
    </Picker>
  );
}
