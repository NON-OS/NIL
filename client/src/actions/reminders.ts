import http from '../api/http';
import type Reminder from '../types/Reminder';

const reminders = {
  list: () => http.get<Reminder[]>('/reminders'),
  create: (input: { taskId?: string; note?: string; remindAt: number }) => http.post<{ reminder: Reminder }>('/reminders', input).then((r) => r.reminder),
  remove: (id: string) => http.del(`/reminders/${id}`),
};

export default reminders;
