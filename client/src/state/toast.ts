import type ToastMessage from '../types/ToastMessage';
import store from './store';

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
    return toast.show(err instanceof Error ? err.message : 'Something went wrong.', { tone: 'error', timeout: 5000 });
  },

  dismiss(id: number) {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
};

export default toast;
