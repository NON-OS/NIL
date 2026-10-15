import { useEffect, useState } from 'react';

// Re-renders every `ms` so relative times ("5m ago") stay honest.
export default function useNow(ms = 60_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
