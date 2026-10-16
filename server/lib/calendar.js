// Plain calendar math on 'YYYY-MM-DD' strings. Noon UTC keeps DST from shifting days.
const toDate = (s) => new Date(`${s}T12:00:00Z`);
const toString = (d) => d.toISOString().slice(0, 10);

const calendar = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  addDays(s, n) {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return toString(d);
  },

  next(s, recurrence) {
    switch (recurrence) {
      case 'daily':
        return calendar.addDays(s, 1);
      case 'weekdays': {
        let d = calendar.addDays(s, 1);
        while ([0, 6].includes(toDate(d).getUTCDay())) d = calendar.addDays(d, 1);
        return d;
      }
      case 'weekly':
        return calendar.addDays(s, 7);
      case 'biweekly':
        return calendar.addDays(s, 14);
      case 'monthly': {
        const [y, m, day] = s.split('-').map(Number);
        const year = m === 12 ? y + 1 : y;
        const month = m === 12 ? 1 : m + 1;
        // Jan 31 -> Feb 28, not Mar 3
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
      }
      default:
        return null;
    }
  },
};

export default calendar;
