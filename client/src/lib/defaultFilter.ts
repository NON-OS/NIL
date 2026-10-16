import type TaskFilter from '../types/TaskFilter';

const defaultFilter: TaskFilter = {
  query: '',
  assignees: [],
  priorities: [],
  labels: [],
  projects: [],
  due: 'any',
  showClosed: false,
};

export default defaultFilter;
