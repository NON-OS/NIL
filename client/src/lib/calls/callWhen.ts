const DAY = 86_400_000;

// When a call was and how long it lasted, the way a phone's recent calls say it: "14:05" today,
// "Yesterday", the weekday this week, a date before that; and "12 min" or "1 h 5 min".
const callWhen = {
  at(ms: number, now = Date.now()) {
    const then = new Date(ms);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (ms >= start.getTime()) return then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (ms >= start.getTime() - DAY) return 'Yesterday';
    if (ms >= start.getTime() - 6 * DAY) return then.toLocaleDateString(undefined, { weekday: 'long' });
    return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(then.getFullYear() !== start.getFullYear() ? { year: 'numeric' } : {}) });
  },

  lasted(seconds: number) {
    if (seconds < 60) return seconds < 5 ? 'a moment' : `${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  },
};

export default callWhen;
