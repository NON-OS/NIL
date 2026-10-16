import meta from './meta';
import type Role from '../types/Role';

const HINT: Record<Role, string> = { guest: 'Sees only chosen projects', member: 'Works on tasks', admin: 'Manages people', owner: 'Full control' };

// Roles as picker options, most limited first.
const roleOptions = (['guest', 'member', 'admin', 'owner'] as Role[]).map((r) => ({ value: r, label: meta.role[r], hint: HINT[r] }));

export default roleOptions;
