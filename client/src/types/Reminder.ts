export default interface Reminder {
  id: string;
  taskId: string | null;
  note: string;
  remindAt: number;
  sentAt: number | null;
}
