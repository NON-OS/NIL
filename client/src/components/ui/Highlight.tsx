import highlightParts from '../../lib/highlightParts';

// Text with the words of a search marked.
export default function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) => (part.hit ? <mark key={i} className="hit">{part.text}</mark> : part.text))}
    </>
  );
}
