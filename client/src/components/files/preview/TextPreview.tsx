import '../Files.css';
import { useEffect, useState } from 'react';
import Markdown from '../../ui/Markdown';

// Text, code and Markdown, as text. Markdown goes through the app's own renderer, which never
// injects HTML; everything else is shown exactly as written, in the monospaced face. A file that
// turns out to be binary says so instead of filling the screen with noise.
export default function TextPreview({ blob, markdown }: { blob: Blob; markdown: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [source, setSource] = useState(!markdown);

  useEffect(() => {
    let live = true;
    blob.arrayBuffer().then((buffer) => {
      if (!live) return;
      const bytes = new Uint8Array(buffer);
      if (bytes.subarray(0, 8192).includes(0)) return setBinary(true);
      setText(new TextDecoder('utf-8').decode(bytes));
    });
    return () => {
      live = false;
    };
  }, [blob]);

  if (binary) return <div className="files-placeholder">This file isn’t text, so there’s nothing to show here. Download it to open it.</div>;
  if (text === null) return null;
  return (
    <div className="files-viewer">
      <div className="files-viewer-bar">
        {markdown ? (
          <div role="group" aria-label="Show as" style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn btn-sm" aria-pressed={!source} onClick={() => setSource(false)}>
              Formatted
            </button>
            <button type="button" className="btn btn-sm" aria-pressed={source} onClick={() => setSource(true)}>
              Source
            </button>
          </div>
        ) : (
          <span className="muted num">{`${text.split('\n').length} lines`}</span>
        )}
      </div>
      <div className="files-viewer-scroll" tabIndex={0} aria-label="File contents">
        {source ? (
          <pre className="files-text">{text}</pre>
        ) : (
          <div className="files-markdown">
            <Markdown text={text} headingLevel={2} />
          </div>
        )}
      </div>
    </div>
  );
}
