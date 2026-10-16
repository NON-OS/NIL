// Words that say something is done without being the thing itself.
const CLAIMS = new Set(
  `done did do completed complete completes finished finish finishes ticked tick checked check verified verify tested test handled addressed resolved
  ready ok okay yes as requested per the a an and or but is are was were be been being now both all has have had it its this that these those
  item items task tasks checklist step steps of to for in on at with by from i we my our me us so also already here there`.split(/\s+/),
);

const words = (text) => (String(text ?? '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []);

// Whether what a built-in agent attached to a checklist item is work, or only a claim of work.
// The result has to say at least three things of its own: words that aren't the item's own text
// and aren't "done", "completed" and the like. "Headline done" isn't work; "Headline: Plan your
// week in one place" is. Returns null when it passes, or the reason it doesn't.
export default function checkWorkProduct(result, itemText) {
  const own = new Set(words(itemText));
  const content = words(result).filter((w) => !CLAIMS.has(w) && !own.has(w));
  if (content.length >= 3) return null;
  return 'the result only says it’s done; it has to contain the work itself (the text, the plan, the answer, or what a tool call changed)';
}
