// The seats paid for at `at`. Each step holds from its own time until the next one starts; before
// the first there are none, which only happens ahead of paid time that hasn't begun.
export default function seatsAt(steps, at) {
  return steps.findLast((s) => s.from <= at)?.seats ?? 0;
}
