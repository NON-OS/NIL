import api from '../lib/api.mjs';

// [who, task, comment], in the order they were said
const COMMENTS = [
  ['cleo', 'Fix balance flicker on cold start', 'Found it: the cached balance renders before the price feed is back. The fix holds the skeleton until both arrive. Up for review.'],
  ['ada', 'Fix balance flicker on cold start', 'Nice catch. @Ben can you check the skeleton state looks right on small screens?'],
  ['ben', 'Fix balance flicker on cold start', 'Checked on an iPhone SE and a Pixel 7. Looks right on both.'],
  ['ben', 'Finish the onboarding flow redesign', 'Biometric unlock screens are in Files, under Design. Two versions of the empty wallet state there too.'],
  ['ada', 'Finish the onboarding flow redesign', 'The backup step reads much better now. Can we put it in front of five people this week?'],
  ['ada', 'Security review of the key backup flow', '@Cleo can you pair with me on Thursday? I want to walk the threat model before we freeze.'],
  ['cleo', 'Security review of the key backup flow', 'Yes. I will bring the notes from the last review and the new recovery path.'],
  ['dev', 'Book the venue in Lisbon', 'Two venues hold both weekends until Friday. Vote is open in Votes.'],
  ['cleo', 'Review three take-home projects', 'Two are strong. Notes in the Hiring doc.'],
  ['dev', 'Crash on Android 12 when scanning a QR code', 'Seen on four beta devices, all Android 12 with the camera permission denied once.'],
  ['ben', 'New homepage hero and copy', '@Dev first draft of the headline is in the doc. Short version and a long version.'],
];

// Conversations on the tasks, from the people working on them.
export default async function taskComments({ pages }, task) {
  for (const [who, title, body] of COMMENTS) await api(pages[who], 'POST', `/tasks/${task[title].id}/comments`, { body });
}
