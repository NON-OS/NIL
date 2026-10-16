// What an invoice costs, in micro-USD, before any token amounts. Pure arithmetic, so it reads
// the same in the quote, on the invoice and in tests.
//
// A "periods" invoice buys `periods` periods for `people` people: the flat fee per period plus
// the seat price for everyone above the free seats. A "seats" invoice adds people to paid time
// that is already running, priced for the part of the period that's left.
export default function priceBreakdown({ kind = 'periods', periods, people, freeSeats, priceUsd, seatUsd, stakerPercent = 0, credit = 0, seatLimit = 0, remainingMs = 0, periodMs }) {
  let seats;
  let baseUsd;
  let seatsUsd;
  if (kind === 'seats') {
    seats = Math.max(0, people - Math.max(seatLimit, freeSeats));
    baseUsd = 0;
    seatsUsd = Math.ceil((seatUsd * seats * remainingMs) / periodMs);
  } else {
    seats = Math.max(0, people - freeSeats);
    baseUsd = priceUsd * periods;
    seatsUsd = seatUsd * seats * periods;
  }
  const subtotalUsd = baseUsd + seatsUsd;
  const stakerUsd = Math.floor((subtotalUsd * stakerPercent) / 100);
  const totalUsd = subtotalUsd - stakerUsd;
  const creditUsd = Math.max(0, Math.min(credit, totalUsd));
  return { kind, periods: kind === 'seats' ? 0 : periods, people, seats, baseUsd, seatUsd, seatsUsd, subtotalUsd, stakerPercent, stakerUsd, totalUsd, creditUsd, dueUsd: totalUsd - creditUsd };
}
