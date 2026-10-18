import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// frames to keep trying to move focus in when a surface opens
const FOCUS_TRIES = 10;

const tabbable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

interface Options {
  // where focus goes on open when nothing inside has it yet; the surface itself by default
  initialFocus?: string;
  // for a surface that stays mounted and opens and closes, like the phone menu
  active?: boolean;
}

// For aria-modal surfaces: moves focus in on open, keeps Tab and Shift+Tab inside, and gives
// focus back to whatever had it before on close. Menus and dialogs opened on top of the
// surface manage their own focus, so a Tab pressed while focus is outside is left alone.
export default function useFocusTrap(ref: RefObject<HTMLElement>, { initialFocus, active = true }: Options = {}) {
  // read during render, when the surface opens: children with autoFocus take focus before any
  // effect runs
  const opener = useRef<Element | null>(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current) opener.current = document.activeElement;
  wasActive.current = active;

  useEffect(() => {
    const root = ref.current;
    if (!root || !active) return;
    const returnTo = opener.current;
    const target = () => (initialFocus && root.querySelector<HTMLElement>(initialFocus)) || root;
    // A surface that has only just turned visible can refuse focus for a frame or two while its
    // children finish turning visible too, so focus is tried again on the next few frames.
    let retry = 0;
    let tries = FOCUS_TRIES;
    const focusIn = () => {
      target().focus();
      if (!root.contains(document.activeElement) && --tries > 0) retry = requestAnimationFrame(focusIn);
    };
    if (!root.contains(document.activeElement)) focusIn();

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
      cancelAnimationFrame(retry);
      document.removeEventListener('keydown', onKey);
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, [ref, initialFocus, active]);
}
