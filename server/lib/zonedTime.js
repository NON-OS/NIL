const DAY = 86_400_000;
const formatters = new Map();

function parts(ts, zone) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(zone, format);
  }
  return Object.fromEntries(format.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
}

// How far the zone's wall clock is ahead of UTC at that moment, in milliseconds.
function offset(ts, zone) {
  const p = parts(ts, zone);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - (ts - (ts % 1000));
}

// Wall-clock dates and times in a named time zone, using the zone data built into Node.
const zonedTime = {
  wallClock(ts, zone) {
    const p = parts(ts, zone);
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  },

  // The UTC moment of a 'YYYY-MM-DD' date and 'HH:MM' time on the zone's wall clock. A zone's
  // offset changes at most once in a day, so the offsets a day either side cover both answers.
  // A time that happens twice when clocks go back takes the first; a time skipped when they go
  // forward lands after the jump, as a person setting a clock would expect.
  toUtc(date, time, zone) {
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const naive = Date.UTC(y, m - 1, d, h, min);
    const candidates = [naive - offset(naive - DAY, zone), naive - offset(naive + DAY, zone)];
    const exact = candidates.filter((ts) => {
      const wall = zonedTime.wallClock(ts, zone);
      return wall.date === date && wall.time === time;
    });
    return exact.length ? Math.min(...exact) : candidates[0];
  },

  // The server's own zone, for people who haven't told Nil theirs.
  local: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export default zonedTime;
