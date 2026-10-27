import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import Modal from '../../ui/Modal';

const SAFE = /^(https?:\/\/|mailto:)/i;

// Adds, changes or removes the link on the selected text. Only web and email links: anything
// else (javascript:, data:, file:) is refused here and again by the editor.
export default function LinkEditor({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('link').href as string | undefined;
  const [href, setHref] = useState(current ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const value = href.trim() && !SAFE.test(href.trim()) && !href.includes(':') ? `https://${href.trim()}` : href.trim();
  const ok = !value || SAFE.test(value);

  const save = () => {
    if (!ok) return;
    const c = editor.chain().focus().extendMarkRange('link');
    (value ? c.setLink({ href: value }) : c.unsetLink()).run();
    onClose();
  };

  const footer = (
    <>
      {current && (
        <button type="button" className="btn" onClick={() => (editor.chain().focus().extendMarkRange('link').unsetLink().run(), onClose())}>
          Remove link
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={save} disabled={!ok}>
        Save
      </button>
    </>
  );

  return (
    <Modal title={current ? 'Edit link' : 'Add a link'} onClose={onClose} footer={footer} width={460}>
      <form className="modal-body" style={{ display: 'grid', gap: 8 }} onSubmit={(e) => (e.preventDefault(), save())}>
        <label className="field">
          <span>Address</span>
          <input ref={input} className="input" value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://example.com" aria-invalid={!ok} />
        </label>
        {!ok && (
          <p className="muted" role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
            Links can go to web pages (https) or email addresses (mailto) only.
          </p>
        )}
      </form>
    </Modal>
  );
}
