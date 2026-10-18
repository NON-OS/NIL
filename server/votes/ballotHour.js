// Anonymous ballots are counted an hour at a time, and a Semaphore ballot names the hour it was
// proven in, so a proof copied out of an earlier hour can't be sent again to undo a change of
// mind. A ballot proven just before the hour turns may arrive a little after; it still counts
// for its own hour, which is why an hour's ballots wait out the grace before they're counted.
const HOUR = 3_600_000;
const GRACE = 5 * 60_000;
const hourOf = (time) => time - (time % HOUR);

const ballotHour = {
  HOUR,
  GRACE,
  of: hourOf,
  index: (time) => Math.floor(time / HOUR),

  // Whether a ballot proven in the hour with this index may still arrive now.
  open(index, now = Date.now()) {
    const current = Math.floor(now / HOUR);
    return index === current || (index === current - 1 && now % HOUR < GRACE);
  },

  // Ballots from hours that began before this can no longer arrive, so they may be counted.
  countableBefore: (now = Date.now()) => hourOf(now - GRACE),

  // When the ballots of the hour starting at `hour` join the count.
  countsAt: (hour) => hour + HOUR + GRACE,
};

export default ballotHour;
