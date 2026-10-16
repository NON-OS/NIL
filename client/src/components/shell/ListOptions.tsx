import { ArrowDownUp, Rows3 } from 'lucide-react';
import Picker from '../ui/Picker';
import type GroupKey from '../../types/GroupKey';
import type SortKey from '../../types/SortKey';

interface Props {
  groupBy: GroupKey;
  sortBy: SortKey;
  onGroup: (key: GroupKey) => void;
  onSort: (key: SortKey) => void;
}

const GROUPS: { value: GroupKey; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due date' },
  { value: 'none', label: 'No grouping' },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'manual', label: 'Board order' },
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due date' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Newest first' },
  { value: 'title', label: 'Title A–Z' },
];

export default function ListOptions({ groupBy, sortBy, onGroup, onSort }: Props) {
  return (
    <>
      <Picker title="Group by" options={GROUPS} value={groupBy} onChange={(v) => onGroup(v as GroupKey)} className="filter-btn" width={190} align="end">
        <Rows3 /> {GROUPS.find((g) => g.value === groupBy)?.label}
      </Picker>
      <Picker title="Sort by" options={SORTS} value={sortBy} onChange={(v) => onSort(v as SortKey)} className="filter-btn" width={200} align="end">
        <ArrowDownUp /> {SORTS.find((s) => s.value === sortBy)?.label}
      </Picker>
    </>
  );
}
