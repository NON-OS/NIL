import http from '../api/http';
import type SearchHit from '../types/SearchHit';
import type Status from '../types/Status';

interface ServerHit {
  id: string;
  number: number;
  title: string;
  status: Status;
  field: 'title' | 'description' | 'checklist' | 'comment';
  snippet: string;
}

// Team tasks, searched by the server's full-text index. Private tasks never go there; the
// browser searches those itself (see lib/searchOpened).
export default async function searchTeam(query: string): Promise<SearchHit[]> {
  const { tasks } = await http.get<{ tasks: ServerHit[] }>(`/search?q=${encodeURIComponent(query)}`);
  return tasks.map((t) => ({ kind: 'task', id: t.id, number: t.number, status: t.status, title: t.title, field: t.field, snippet: t.snippet }));
}
