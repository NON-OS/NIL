// Invisible characters that change which way text runs. In a file name they can make one that
// ends in .exe read as if it ended in .pdf, so names from other people lose them before they're
// shown or saved.
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export default function stripBidi(text: string) {
  return text.replace(BIDI, '');
}
