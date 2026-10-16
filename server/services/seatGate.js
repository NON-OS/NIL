import plan from './plan.js';
import HttpError from '../lib/HttpError.js';

// Teams up to the free seat count need no subscription; growing past it does. Guests, such as
// accepted bounty applicants, never take a seat.
export default function seatGate(role) {
  if (role === 'guest') return;
  const status = plan.status();
  if (!status.unlocked && status.seatsUsed >= status.freeSeats) {
    throw new HttpError(402, `The free plan includes ${status.freeSeats} people. An admin can add more seats with a NOX subscription in Settings → Plan.`);
  }
}
