// Set right after someone creates their account, so the app suggests a backup wallet once.
// It lives only in this tab: reloading or dismissing it is the end of it.
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const backupNudge = {
  get: () => open,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  show() {
    open = true;
    emit();
  },

  dismiss() {
    open = false;
    emit();
  },
};

export default backupNudge;
