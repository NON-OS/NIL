// marked lexes a nested list or quote by lexing its text over again, so its memory grows with
// the cube of the depth: a few hundred kilobytes of ever deeper `- ` or `>` lines can take a
// browser tab down. No real document nests this far, so deeper lines are flattened to these
// limits before lexing. It applies inside code blocks too, where only absurd indentation is
// touched; telling code apart here the way marked does would leave a gap to slip through.
const MAX_MARKERS = 8;
const MAX_INDENT = 32;

// one container marker at the start of a line: a quote, or a bullet or number and its space
const MARKER = /[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$))/y;

function columns(space: string) {
  let n = 0;
  for (const c of space) n = c === '\t' ? n + 4 - (n % 4) : n + 1;
  return n;
}

function limitLine(line: string) {
  const indent = /^[ \t]*/.exec(line)![0];
  const out = columns(indent) > MAX_INDENT ? ' '.repeat(MAX_INDENT) + line.slice(indent.length) : line;
  MARKER.lastIndex = 0;
  let markers = 0;
  let kept = 0;
  let end = 0;
  while (MARKER.exec(out)) {
    end = MARKER.lastIndex;
    if (++markers <= MAX_MARKERS) kept = end;
  }
  return markers > MAX_MARKERS ? out.slice(0, kept) + out.slice(end) : out;
}

export default function limitNesting(text: string) {
  return text.split('\n').map(limitLine).join('\n');
}
