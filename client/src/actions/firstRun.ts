import http from '../api/http';
import store from '../state/store';
import toast from '../state/toast';
import dates from '../lib/dates';
import type FirstRun from '../types/FirstRun';

const save = (next: FirstRun) => store.set({ firstRun: next });

const firstRun = {
  load: () => http.get<FirstRun>('/first-run').then(save).catch(() => {}),

  // Only tells the server once, and only while the card is up. Quick add works on every page,
  // so the card's state may not be loaded yet; it's asked for once per page load.
  async quickAdded() {
    if (!store.get().firstRun) await firstRun.load();
    const current = store.get().firstRun;
    if (!current?.active || current.quickAdd) return;
    save({ ...current, quickAdd: true });
    await http.patch<FirstRun>('/first-run', { quickAdd: true }).then(save).catch(() => {});
  },

  async dismiss() {
    try {
      save(await http.patch<FirstRun>('/first-run', { dismissed: true }));
    } catch (err) {
      toast.error(err);
    }
  },

  async addSample() {
    try {
      save(await http.post<FirstRun>('/first-run/sample', { today: dates.today() }));
      toast.show('Sample project added. Remove it from My work whenever you like.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  },

  async removeSample() {
    try {
      save(await http.del<FirstRun>('/first-run/sample'));
      toast.show('Sample project removed.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  },
};

export default firstRun;
