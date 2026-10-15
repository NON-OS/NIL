import store from '../state/store';
import type Task from '../types/Task';

const ui = {
  quickAdd: (defaults?: Partial<Task>) => store.set({ quickAdd: { open: true, defaults } }),
  closeQuickAdd: () => store.set({ quickAdd: { open: false } }),
  palette: (open = true) => store.set({ palette: open }),
  shortcuts: (open = true) => store.set({ shortcuts: open }),
  extract: (open = true) => store.set({ extract: open }),
  sidebar: (open: boolean) => store.set({ sidebarOpen: open }),
};

export default ui;
