export default interface TimeEntry {
  id: string;
  taskId: string | null;
  note: string;
  startedAt: number;
  // null while the timer is running
  endedAt: number | null;
}
