import { useEffect } from 'react';
import isEditable from '../lib/isEditable';
import router from '../lib/router';
import store from '../state/store';
import ui from '../actions/ui';
import cryptoOnly from '../lib/cryptoOnly';

const GOTO: Record<string, string> = { h: '/', i: '/inbox', b: '/board', l: '/list', c: '/calendar', g: '/goals', s: '/insights', n: '/bounties', v: '/votes', m: '/time', d: '/docs', a: '/calls', p: '/proofs', t: '/settings', k: '/chat' };

// Global keys. "g" starts a two-key jump (g then b = board), like Gmail and Linear.
export default function useShortcuts() {
  useEffect(() => {
    let leader = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // in a doc's text the editor takes it for a link
        if (e.defaultPrevented) return;
        e.preventDefault();
        ui.palette(!store.get().palette);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const s = store.get();
      if (s.palette || s.quickAdd.open || s.extract) return;

      if (leader && Date.now() - leader < 1200 && GOTO[e.key] && (s.workspace.cryptoTools || !cryptoOnly(GOTO[e.key]))) {
        e.preventDefault();
        leader = 0;
        router.navigate(GOTO[e.key]);
        return;
      }
      leader = 0;
      if (e.key === 'g') leader = Date.now();
      else if (e.key === 'c' || e.key === 'n') {
        e.preventDefault();
        ui.quickAdd();
      } else if (e.key === '/') {
        e.preventDefault();
        ui.palette();
      } else if (e.key === '?') {
        e.preventDefault();
        ui.shortcuts();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
