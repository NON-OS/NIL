import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

// Colours that read on white and apart from each other, for teammates' cursors.
const COLORS = ['#007C85', '#2438FF', '#B86E00', '#C4302B', '#7B4DD6', '#0B8A4B', '#C2307A', '#4A5568'];

// A teammate's cursor colour, the same in every tab.
export default function cursorColor(userId: string) {
  return COLORS[sha256(utf8ToBytes(userId))[0] % COLORS.length];
}
