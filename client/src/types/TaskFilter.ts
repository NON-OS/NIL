export default interface TaskFilter {
  query: string;
  assignees: string[]; // user ids, plus 'me' and 'none'
  priorities: number[];
  labels: string[];
  projects: string[]; // project ids, plus 'none'
  due: 'any' | 'overdue' | 'today' | 'week' | 'none';
  showClosed: boolean;
}
