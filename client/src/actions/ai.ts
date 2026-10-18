import askAi from './askAi';
import dates from '../lib/dates';
import type LoadedTask from '../types/LoadedTask';

interface DraftTask {
  title: string;
  description: string;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
}

// private tasks never go to the AI, from this browser or any other
const shared = (task: LoadedTask) => {
  if (task.private) throw new Error('Private tasks never go to the AI.');
  return { taskId: task.id };
};

// Each call sends only what that feature needs to the AI provider, and only when someone clicks.
const ai = {
  breakdown: async (task: LoadedTask) => askAi<{ steps: string[] }>('breakdown', shared(task)),
  describe: async (task: LoadedTask) => askAi<{ description: string }>('describe', shared(task)),
  extract: (text: string) => askAi<{ tasks: DraftTask[] }>('extract', { text, today: dates.today() }),
  brief: () => askAi<{ text: string }>('brief', { today: dates.today() }),
};

export default ai;
