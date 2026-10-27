import '../Files.css';
import { useEffect, useState } from 'react';
import Spinner from '../../ui/Spinner';

// The frame allows nothing: no scripts, no forms, no plugins, no navigation out, no requests at
// all. Images inside the document arrive as data: URLs and are the only thing it loads.
const FRAME_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
const STYLE = 'body{margin:0 auto;max-width:760px;padding:28px 24px;color:#0a0b0d;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%;height:auto}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #cdd0d8;padding:4px 8px;vertical-align:top}h1,h2,h3{line-height:1.25}a{color:#007c85}';

// what survives of a converted document: its text and structure, and images only as data: URLs
const PURIFY = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'frame', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'math'],
  FORBID_ATTR: ['style', 'srcset', 'action', 'formaction'],
  ALLOWED_URI_REGEXP: /^(?:data:image\/(?:png|jpe?g|gif|webp);base64,|#)/i,
};

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><meta name="referrer" content="no-referrer"><style>${STYLE}</style></head><body>${body}</body></html>`;

// A Word file turned into HTML with mammoth, cleaned with DOMPurify, and shown in a sandboxed
// frame that can't run anything even if something slipped through. Both libraries load the first
// time a Word file is opened. Layout is approximate: mammoth keeps headings, lists, tables, links'
// text and images, not page design.
export default function DocxPreview({ blob }: { blob: Blob }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([import('mammoth'), import('dompurify')]);
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      if (live) setHtml(page(DOMPurify.sanitize(value, PURIFY)));
    })().catch(() => live && setError('This Word file couldn’t be shown here. Download it to open it in another app.'));
    return () => {
      live = false;
    };
  }, [blob]);

  if (error) return <div className="files-placeholder">{error}</div>;
  if (html === null) {
    return (
      <div className="files-placeholder">
        <Spinner size={20} />
      </div>
    );
  }
  return <iframe className="files-doc" sandbox="" srcDoc={html} title="Word document preview" referrerPolicy="no-referrer" />;
}
