const MINUTE = 60_000;

// Tunnels per source per minute, and open at once. A source is one connection's own address on
// a workspace network, which a workspace can't fake. take() answers 'rate' or 'busy', or a
// release function to call once when the tunnel closes.
export default function connectionGate({ perMinute, concurrent }) {
  const sources = new Map();
  return {
    take(source, now) {
      const entry = sources.get(source) ?? { open: 0, starts: [] };
      entry.starts = entry.starts.filter((at) => at > now - MINUTE);
      if (entry.starts.length >= perMinute) return 'rate';
      if (entry.open >= concurrent) return 'busy';
      entry.starts.push(now);
      entry.open++;
      sources.set(source, entry);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.open--;
        if (!entry.open && !entry.starts.length) sources.delete(source);
      };
    },
    size: () => sources.size,
  };
}
