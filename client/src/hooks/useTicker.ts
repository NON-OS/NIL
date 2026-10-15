import { useEffect, useState } from 'react';

// Ticks every second, but only while `active`, so an idle timer costs nothing.
export default function useTicker(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
