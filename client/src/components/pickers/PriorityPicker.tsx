import type { ReactNode } from 'react';
import Picker from '../ui/Picker';
import PriorityIcon from '../ui/PriorityIcon';
import meta from '../../lib/meta';
import type Priority from '../../types/Priority';

interface Props {
  value: Priority;
  onChange: (priority: Priority) => void;
  children: ReactNode;
  className?: string;
}

const OPTIONS = meta.priorities.map((p) => ({ value: String(p), label: meta.priority[p], icon: <PriorityIcon priority={p} /> }));

export default function PriorityPicker({ value, onChange, children, className }: Props) {
  return (
    <Picker title="Change priority" options={OPTIONS} value={String(value)} onChange={(v) => onChange(Number(v) as Priority)} className={className} width={200}>
      {children}
    </Picker>
  );
}
