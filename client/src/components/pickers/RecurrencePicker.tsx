import type { ReactNode } from 'react';
import Picker from '../ui/Picker';
import meta from '../../lib/meta';
import recurrenceRule from '../../lib/recurrenceRule';
import type Recurrence from '../../types/Recurrence';

interface Props {
  value: Recurrence | null;
  onChange: (recurrence: Recurrence | null) => void;
  children: ReactNode;
  className?: string;
}

const OPTIONS = [{ value: '', label: 'Doesn’t repeat' }, ...meta.recurrences.map((r) => ({ value: r, label: meta.recurrence[r] }))];

export default function RecurrencePicker({ value, onChange, children, className }: Props) {
  // a rule typed in quick add, like "every 3 days", stays on the list while it's the one in use
  const options = value && !meta.recurrences.includes(value) ? [...OPTIONS, { value, label: recurrenceRule.describe(value) }] : OPTIONS;
  return (
    <Picker title="Repeat" options={options} value={value ?? ''} onChange={(v) => onChange((v || null) as Recurrence | null)} className={className} width={200}>
      {children}
    </Picker>
  );
}
