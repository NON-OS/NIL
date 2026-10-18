import type ToastMessage from '../types/ToastMessage';
import store from './store';
import ApiError from '../api/ApiError';
import router from '../lib/router';

let nextId = 1;

// How long a toast stays up, unless the caller asks for longer: enough to read it slowly, with
// time on top to reach a button in it. Hovering or focusing a toast pauses it.
const READ = { base: 2500, perWord: 300 };
const LEAST = { plain: 4000, action: 7000, error: 6000, errorAction: 9000 };
const readingTime = (message: string) => READ.base + message.split(/\s+/).length * READ.perWord;

const toast = {
  show(message: string, options: { tone?: ToastMessage['tone']; action?: ToastMessage['action']; timeout?: number } = {}) {
    const least = options.timeout ?? (options.action ? LEAST.action : LEAST.plain);
    const item: ToastMessage = {
      id: nextId++,
      message,
      tone: options.tone ?? 'default',
      action: options.action,
      timeout: Math.max(least, readingTime(message)),
    };
    store.set((s) => ({ toasts: [...s.toasts.slice(-3), item] }));
    return item.id;
  },

  error(err: unknown) {
    // a lapsed subscription isn't a failure to fix, so point straight at where it's renewed
    const action = err instanceof ApiError && err.status === 402 ? { label: 'See plan', run: () => router.navigate('/settings?tab=plan') } : undefined;
    return toast.show(err instanceof Error ? err.message : 'Something went wrong.', { tone: 'error', timeout: action ? LEAST.errorAction : LEAST.error, action });
  },

  dismiss(id: number) {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
};

export default toast;
