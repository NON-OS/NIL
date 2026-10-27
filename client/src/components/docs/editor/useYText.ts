import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import applyTextDiff from '../../../lib/docState/applyTextDiff';

// A shared text as a React value and a setter, kept in step with everyone else's edits.
export default function useYText(text: Y.Text | null) {
  const [value, setValue] = useState(() => text?.toString() ?? '');
  useEffect(() => {
    if (!text) return;
    const read = () => setValue(text.toString());
    read();
    text.observe(read);
    return () => text.unobserve(read);
  }, [text]);
  const set = useCallback((next: string) => text && applyTextDiff(text, next), [text]);
  return [value, set] as const;
}
