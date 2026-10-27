import type ChatRoster from '../types/ChatRoster';
import type User from '../types/User';

export interface RosterEvent {
  key: string;
  at: number;
  text: string;
}

const names = (ids: string[], users: Record<string, User>) => {
  const all = ids.map((id) => users[id]?.name ?? 'someone');
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0];
};

// Who came into a conversation and who went, epoch by epoch, from its checked member lists, as
// lines for the timeline. Everyone sees every change, so nobody joins or is dropped quietly.
export default function rosterEvents(rosters: ChatRoster[], users: Record<string, User>): RosterEvent[] {
  const out: RosterEvent[] = [];
  rosters.forEach((r, i) => {
    const prev = rosters[i - 1];
    const by = users[r.by]?.name ?? 'Someone';
    if (!prev) return out.push({ key: `epoch:${r.epoch}`, at: r.at, text: `${by} started this conversation` });
    const added = r.members.filter((id) => !prev.members.includes(id));
    const gone = prev.members.filter((id) => !r.members.includes(id));
    const departed = gone.filter((id) => r.departed.includes(id));
    const taken = gone.filter((id) => !r.departed.includes(id));
    const parts = [
      added.length ? `${by} added ${names(added, users)}` : '',
      departed.length ? `${names(departed, users)} left` : '',
      taken.length ? `${by} took ${names(taken, users)} out` : '',
    ].filter(Boolean);
    if (parts.length) out.push({ key: `epoch:${r.epoch}`, at: r.at, text: `${parts.join('. ')}. New key.` });
  });
  return out;
}
