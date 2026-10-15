import { useEffect, useRef, useState } from 'react';
import taskActions from '../../actions/tasks';
import type Task from '../../types/Task';

// Edits in place. Enter or leaving the field saves; Escape reverts.
export default function TitleEditor({ task }: { task: Task }) {
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(task.title);
  }, [task.title]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const save = () => {
    const next = value.replace(/\s+/g, ' ').trim();
    if (!next) setValue(task.title);
    else if (next !== task.title) taskActions.update(task.id, { title: next });
  };

  return (
    <textarea
      ref={ref}
      className="drawer-title"
      value={value}
      rows={1}
      maxLength={300}
      aria-label="Task title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          setValue(task.title);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
    />
  );
}
