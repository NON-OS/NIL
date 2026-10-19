// Whether the verifier turned a read down only because of which block it named: one older than
// the light client can prove, or newer than its head. The read itself may be fine, so a shadow
// check asks again at a block both sides have.
export default function beyondReach(answer) {
  return answer.verdict === 'unverified' && answer.error?.data?.reason === 'out-of-range';
}
