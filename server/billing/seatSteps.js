// The plan's seat counts as steps in time. A plan saved before there were steps has one count,
// which then holds until a renewal sets a new one.
export default function seatSteps(stored) {
  if (Array.isArray(stored.seatSteps)) return stored.seatSteps;
  return stored.seatLimit ? [{ from: 0, seats: stored.seatLimit }] : [];
}
