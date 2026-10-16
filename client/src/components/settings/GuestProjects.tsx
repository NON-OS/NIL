import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import Picker from '../ui/Picker';
import toast from '../../state/toast';
import http from '../../api/http';
import people from '../../actions/people';
import type User from '../../types/User';

// Which projects a guest can see. Admins adjust it any time; it applies on the guest's next
// request, and live updates from other projects never reach them.
export default function GuestProjects({ user, options }: { user: User; options: { value: string; label: string }[] }) {
  const [picked, setPicked] = useState<string[] | null>(null);

  useEffect(() => {
    http.get<{ projectIds: string[] }>(`/users/${user.id}/projects`).then((r) => setPicked(r.projectIds)).catch(toast.error);
  }, [user.id]);

  const toggle = (id: string) => {
    const next = picked!.includes(id) ? picked!.filter((x) => x !== id) : [...picked!, id];
    setPicked(next);
    people.update(user.id, { projects: next });
  };

  if (!picked) return null;
  return (
    <Picker title="Projects this guest can see" multi options={options} value={picked} onChange={toggle} className="btn btn-sm" width={260} align="end">
      <FolderKanban /> {picked.length} project{picked.length === 1 ? '' : 's'}
    </Picker>
  );
}
