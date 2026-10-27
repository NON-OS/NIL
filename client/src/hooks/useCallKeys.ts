import { useEffect } from 'react';
import isEditable from '../lib/isEditable';
import callStore from '../state/callStore';
import callMedia from '../actions/calls/callMedia';
import callRuntime from '../actions/calls/callRuntime';
import localMedia from '../actions/calls/localMedia';

// Keys for the call this tab is in. Ctrl or Cmd with D (microphone) and E (camera) work
// anywhere in the app, as in other call apps. On the open call screen, single keys do too:
// M, V, S (share), L (layout), P (picture in picture), and Escape minimizes. Nothing here acts
// while a field has focus, or while a dialog or menu is open on top of the call.
export default function useCallKeys(onPip: (() => void) | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const call = callStore.get().active;
      if (!call || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (key === 'd' || key === 'e')) {
        e.preventDefault();
        if (key === 'd') callMedia.toggleMic();
        else void callMedia.toggleCam();
        return;
      }
      if (call.minimized || e.metaKey || e.ctrlKey || isEditable(e.target) || document.querySelector('.modal-scrim, .popover')) return;
      const actions: Record<string, (() => void) | null> = {
        m: callMedia.toggleMic,
        v: () => void callMedia.toggleCam(),
        s: localMedia.canShareScreen() ? () => void callMedia.toggleScreen() : null,
        l: () => callRuntime.patch((a) => ({ layout: a.layout === 'grid' ? 'speaker' : 'grid', pinned: null })),
        p: onPip,
        escape: () => callRuntime.patch(() => ({ minimized: true })),
      };
      const run = actions[key];
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onPip]);
}
