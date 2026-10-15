import http from '../api/http';
import dates from '../lib/dates';

interface DraftTask {
  title: string;
  description: string;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
}

// Each call sends only what that feature needs to the AI provider, and only when someone clicks.
const ai = {
  breakdown: (taskId: string) => http.post<{ steps: string[] }>('/ai/breakdown', { taskId }),
  describe: (taskId: string) => http.post<{ description: string }>('/ai/describe', { taskId }),
  extract: (text: string) => http.post<{ tasks: DraftTask[] }>('/ai/extract', { text, today: dates.today() }),
  brief: () => http.post<{ text: string }>('/ai/brief', { today: dates.today() }),
};

export default ai;
