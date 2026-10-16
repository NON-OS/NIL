import { useMemo, type ReactNode } from 'react';
import Picker from '../ui/Picker';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';

interface Props {
  value: string | null;
  onChange: (userId: string | null) => void;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
  // leaves agents out: for private tasks, which agents can't read, and for roles only people hold
  excludeAgents?: boolean;
}

export default function AssigneePicker({ value, onChange, children, className, align, excludeAgents = false }: Props) {
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.me?.id);
  const options = useMemo(() => {
    const people = Object.values(users)
      .filter((u) => !u.deactivated && !(excludeAgents && u.kind === 'agent'))
      .sort((a, b) => Number(b.id === meId) - Number(a.id === meId) || Number(a.kind === 'agent') - Number(b.kind === 'agent') || a.name.localeCompare(b.name));
    return [
      { value: '', label: 'Unassigned', icon: <Avatar user={null} size={18} /> },
      ...people.map((u) => ({
        value: u.id,
        label: u.id === meId ? `${u.name} (you)` : u.name,
        icon: <Avatar user={u} size={18} />,
        hint: u.kind === 'agent' ? 'Agent' : undefined,
        keywords: u.kind === 'agent' ? `${u.title} agent` : u.title,
      })),
    ];
  }, [users, meId, excludeAgents]);

  return (
    <Picker title="Assign" placeholder="Assign to…" options={options} value={value ?? ''} onChange={(v) => onChange(v || null)} className={className} align={align}>
      {children}
    </Picker>
  );
}
