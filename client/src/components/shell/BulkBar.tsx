import './BulkBar.css';
import { CalendarDays, CircleDot, Flag, FolderKanban, Tag, Trash2, UserRound, X } from 'lucide-react';
import StatusPicker from '../pickers/StatusPicker';
import PriorityPicker from '../pickers/PriorityPicker';
import AssigneePicker from '../pickers/AssigneePicker';
import ProjectPicker from '../pickers/ProjectPicker';
import LabelPicker from '../pickers/LabelPicker';
import DatePicker from '../ui/DatePicker';
import taskActions from '../../actions/tasks';
import meta from '../../lib/meta';

interface Props {
  ids: string[];
  onClear: () => void;
}

export default function BulkBar({ ids, onClear }: Props) {
  if (!ids.length) return null;
  const n = `${ids.length} task${ids.length === 1 ? '' : 's'}`;
  const apply = (patch: Record<string, unknown>, message: string) => taskActions.bulkUpdate(ids, patch, message);

  return (
    <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
      <span className="count num">{ids.length} selected</span>
      <StatusPicker value="todo" onChange={(status) => apply({ status }, `Moved ${n} to ${meta.status[status]}`)}>
        <CircleDot size={14} /> <span>Status</span>
      </StatusPicker>
      <PriorityPicker value={0} onChange={(priority) => apply({ priority }, `Set ${n} to ${meta.priority[priority]}`)}>
        <Flag size={14} /> <span>Priority</span>
      </PriorityPicker>
      <AssigneePicker value={null} onChange={(assigneeId) => apply({ assigneeId }, assigneeId ? `Assigned ${n}` : `Unassigned ${n}`)}>
        <UserRound size={14} /> <span>Assign</span>
      </AssigneePicker>
      <ProjectPicker value={null} onChange={(projectId) => apply({ projectId }, `Moved ${n}`)}>
        <FolderKanban size={14} /> <span>Project</span>
      </ProjectPicker>
      <DatePicker value={null} onChange={(dueDate) => apply({ dueDate }, dueDate ? `Rescheduled ${n}` : `Cleared due dates on ${n}`)} title="Set due date">
        <CalendarDays size={14} /> <span>Due</span>
      </DatePicker>
      <LabelPicker value={[]} onChange={(labels) => labels.length && apply({ labelsAdd: labels }, `Labeled ${n}`)}>
        <Tag size={14} /> <span>Label</span>
      </LabelPicker>
      <button type="button" className="prop-btn" style={{ color: 'var(--danger)' }} onClick={() => (taskActions.bulkRemove(ids), onClear())}>
        <Trash2 size={14} /> <span>Delete</span>
      </button>
      <button type="button" className="icon-btn" onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">
        <X />
      </button>
    </div>
  );
}
