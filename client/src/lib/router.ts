const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
window.addEventListener('popstate', emit);

const current = () => location.pathname + location.search;

const router = {
  snapshot: current,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  navigate(to: string, { replace = false } = {}) {
    if (to === current()) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    emit();
  },

  param: (key: string) => new URLSearchParams(location.search).get(key),

  setParam(key: string, value: string | null, { replace = false } = {}) {
    const params = new URLSearchParams(location.search);
    if (value === null) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.navigate(location.pathname + (qs ? `?${qs}` : ''), { replace });
  },

  // For <a href> links: plain clicks stay in the app, modifier clicks open a new tab as usual.
  link(to: string) {
    return (e: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.navigate(to);
    };
  },
};

export default router;
