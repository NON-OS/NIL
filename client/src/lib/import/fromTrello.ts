import clip from './clip';
import dateFromText from './dateFromText';
import statusFromText from './statusFromText';
import type ImportFile from '../../types/ImportFile';
import type ImportItem from '../../types/ImportItem';

interface TrelloBoard {
  name?: string;
  lists?: { id: string; name?: string; closed?: boolean }[];
  cards?: { id: string; name?: string; desc?: string; idList?: string; idMembers?: string[]; due?: string | null; dueComplete?: boolean; closed?: boolean; labels?: { name?: string }[] }[];
  checklists?: { idCard?: string; checkItems?: { name?: string; state?: string; pos?: number }[] }[];
  members?: { id: string; fullName?: string; username?: string }[];
  actions?: { type?: string; date?: string; data?: { card?: { id?: string }; text?: string }; memberCreator?: { fullName?: string } }[];
}

// A Trello board exported as JSON. Each open card becomes a task: its list sets the status,
// its first member the assignee, its checklists the checklist and its comments come along.
// Archived cards and cards on archived lists stay behind. Trello's export holds at most its
// latest 1,000 actions, so very old comments on busy boards may be missing.
export default function fromTrello(json: unknown, fileName: string): ImportFile {
  const board = json as TrelloBoard;
  if (!board || typeof board !== 'object' || !Array.isArray(board.cards)) throw new Error('This JSON file isn’t a Trello board export.');
  const lists = new Map((board.lists ?? []).map((l) => [l.id, l]));
  const members = new Map((board.members ?? []).map((m) => [m.id, m.fullName || m.username || null]));
  const project = board.name?.trim() || fileName.replace(/\.json$/i, '');
  const items: ImportItem[] = [];
  let skipped = 0;

  for (const card of board.cards ?? []) {
    const list = card.idList ? lists.get(card.idList) : undefined;
    if (card.closed || list?.closed || !card.name?.trim()) {
      skipped++;
      continue;
    }
    const checklist = (board.checklists ?? [])
      .filter((c) => c.idCard === card.id)
      .flatMap((c) => [...(c.checkItems ?? [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)))
      .filter((i) => i.name?.trim())
      .map((i) => ({ text: clip(i.name!, 500), done: i.state === 'complete' }));
    const comments = (board.actions ?? [])
      .filter((a) => a.type === 'commentCard' && a.data?.card?.id === card.id && a.data.text?.trim())
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .map((a) => ({ author: a.memberCreator?.fullName ?? null, date: dateFromText(a.date), text: a.data!.text! }));
    items.push({
      title: clip(card.name, 300),
      description: clip(card.desc ?? '', 50_000),
      status: card.dueComplete ? 'done' : statusFromText(list?.name),
      priority: 0,
      dueDate: dateFromText(card.due),
      recurrence: null,
      person: card.idMembers?.length ? members.get(card.idMembers[0]) ?? null : null,
      project,
      labels: (card.labels ?? []).map((l) => l.name?.trim() ?? '').filter(Boolean),
      checklist: checklist.slice(0, 200),
      comments,
    });
  }
  return { source: 'trello', name: fileName, items, skipped };
}
