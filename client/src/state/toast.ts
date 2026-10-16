import type ToastMessage from '../types/ToastMessage';
import store from './store';
import ApiError from '../api/ApiError';
import router from '../lib/router';

let nextId = 1;

const toast = {
  show(message: string, options: { tone?: ToastMessage['tone']; action?: ToastMessage['action']; timeout?: number } = {}) {
    const item: ToastMessage = {
      id: nextId++,
      message,
      tone: options.tone ?? 'default',
      action: options.action,
      timeout: options.timeout ?? (options.action ? 6000 : 3500),
    };
    store.set((s) => ({ toasts: [...s.toasts.slice(-3), item] }));
    return item.id;
  },

  error(err: unknown) {
    // a lapsed subscription isn't a failure to fix, so point straight at where it's renewed
    const action = err instanceof ApiError && err.status === 402 ? { label: 'See plan', run: () => router.navigate('/settings?tab=plan') } : undefined;
    return toast.show(err instanceof Error ? err.message : 'Something went wrong.', { tone: 'error', timeout: action ? 8000 : 5000, action });
  },

  dismiss(id: number) {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
};

export default toast;
