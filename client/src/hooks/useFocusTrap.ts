import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const tabbable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

interface Options {
  // where focus goes on open when nothing inside has it yet; the surface itself by default
  initialFocus?: string;
}

// For aria-modal surfaces: moves focus in on open, keeps Tab and Shift+Tab inside, and gives
// focus back to whatever had it before on close. Menus and dialogs opened on top of the
// surface manage their own focus, so a Tab pressed while focus is outside is left alone.
export default function useFocusTrap(ref: RefObject<HTMLElement>, { initialFocus }: Options = {}) {
  // read during render: children with autoFocus take focus before any effect runs
  const opener = useRef(document.activeElement);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const returnTo = opener.current;
    if (!root.contains(document.activeElement)) ((initialFocus && root.querySelector<HTMLElement>(initialFocus)) || root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.contains(document.activeElement)) return;
      const items = tabbable(root);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, [ref, initialFocus]);
}
