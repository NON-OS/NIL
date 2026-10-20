import countOf from '../lib/countOf.js';

// The sentence a 402 gives when the paid tools are paused because more people are here than the
// seats paid for, or null when that isn't why.
export default function seatsPaused(status) {
  if (!status.overSeats) return null;
  return `Nil Pro covers ${countOf(status.seatLimit, 'person', 'people')} and ${status.seatsUsed} are here, so the paid tools are paused. An admin can add seats in Settings → Plan, or make someone a guest.`;
}
