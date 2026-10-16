import type { ReactNode } from 'react';
import Picker from '../ui/Picker';
import StatusIcon from '../ui/StatusIcon';
import meta from '../../lib/meta';
import type Status from '../../types/Status';

interface Props {
  value: Status;
  onChange: (status: Status) => void;
  children: ReactNode;
  className?: string;
}

const OPTIONS = meta.statuses.map((s, i) => ({ value: s, label: meta.status[s], icon: <StatusIcon status={s} />, hint: String(i + 1) }));

export default function StatusPicker({ value, onChange, children, className }: Props) {
  return (
    <Picker title="Change status" options={OPTIONS} value={value} onChange={(v) => onChange(v as Status)} className={className} width={220}>
      {children}
    </Picker>
  );
}
