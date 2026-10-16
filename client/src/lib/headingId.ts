// The anchor id for a heading, made the way GitHub makes them, so a link like
// privacy-model.md#honest-limits lands on the same heading in the repository and in the app.
export default function headingId(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}
