import plan from './plan.js';
import HttpError from '../lib/HttpError.js';

// Adding a person (joining, coming back, or stepping up from guest) needs a free seat: one of
// the free seats without Pro, one of the seats paid for with it. Guests, such as accepted bounty
// applicants, never take a seat.
export default function seatGate(role) {
  if (role === 'guest') return;
  const status = plan.status();
  if (status.seatLimit === null || status.seatsUsed < status.seatLimit) return;
  throw new HttpError(
    402,
    status.unlocked
      ? `Your Nil Pro plan covers ${status.seatLimit} people. An admin can add seats in Settings → Plan.`
      : `The free plan includes ${status.freeSeats} people. An admin can add more with Nil Pro in Settings → Plan.`,
  );
}
