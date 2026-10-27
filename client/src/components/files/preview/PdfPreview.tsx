import '../Files.css';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import Spinner from '../../ui/Spinner';

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
// the largest canvas every browser draws; past it Safari on iOS shows nothing, so a page that
// would be larger is drawn a little less sharp instead
const MAX_CANVAS = 16_777_216;

// A decrypted PDF drawn page by page with pdf.js, loaded the first time a PDF is opened. It's the
// build that carries its own polyfills, so browsers a year or two old show PDFs too, and its
// worker is a file from this server. PDFs never run their scripts or show their forms here:
// pdf.js gets no scripting, no XFA and no eval, and each page is painted onto a canvas with
// annotations as pictures, nothing to type into or click.
export default function PdfPreview({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [lib, setLib] = useState<typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  // the scale the page is drawn at now, which fitting to the width decides
  const [shown, setShown] = useState(1);
  const [error, setError] = useState('');
  const zoomBy = (dir: 1 | -1) => setZoom((dir > 0 ? STEPS.find((s) => s > shown + 0.01) : [...STEPS].reverse().find((s) => s < shown - 0.01)) ?? shown);

  useEffect(() => {
    let task: ReturnType<typeof import('pdfjs-dist/legacy/build/pdf.mjs')['getDocument']> | null = null;
    let live = true;
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const base = `/assets/pdfjs-${pdfjs.version}/`;
      // isEvalSupported is gone from pdf.js 6, which never evaluates code; it's set anyway, so a
      // different build can't turn it back on unnoticed
      const options = { data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableXfa: false, useSystemFonts: true, wasmUrl: `${base}wasm/`, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, iccUrl: `${base}iccs/` };
      task = pdfjs.getDocument(options);
      const opened = await task.promise;
      if (live) {
        setLib(pdfjs);
        setDoc(opened);
      }
    })().catch(() => live && setError('This PDF couldn’t be shown here. Download it to open it in another app.'));
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!doc || !lib || !canvas.current) return;
    let render: RenderTask | null = null;
    let live = true;
    doc.getPage(page).then((p) => {
      if (!live || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      const width = (scroller.current?.clientWidth ?? base.width) - 32;
      const scale = zoom ?? Math.max(0.25, width / base.width);
      setShown(scale);
      const dpr = window.devicePixelRatio || 1;
      const ratio = Math.min(dpr, Math.sqrt(MAX_CANVAS / (base.width * base.height * scale * scale)));
      const viewport = p.getViewport({ scale: scale * ratio });
      const el = canvas.current;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      el.style.width = `${Math.floor(viewport.width / ratio)}px`;
      el.style.height = `${Math.floor(viewport.height / ratio)}px`;
      render = p.render({ canvas: el, viewport, annotationMode: lib.AnnotationMode.ENABLE });
      render.promise.catch(() => {});
    });
    return () => {
      live = false;
      render?.cancel();
    };
  }, [doc, lib, page, zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !doc || (e.target as HTMLElement).matches?.('input, textarea')) return;
      if (e.key === 'PageDown') setPage((p) => Math.min(doc.numPages, p + 1));
      else if (e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
      else if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-') zoomBy(-1);
      else if (e.key === '0') setZoom(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, shown]);

  if (error) return <div className="files-placeholder">{error}</div>;
  const pages = doc?.numPages ?? 0;
  return (
    <div className="files-viewer">
      <div className="files-viewer-bar">
        <button type="button" className="icon-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft />
        </button>
        <label className="num" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="sr-only">Page</span>
          <input className="input files-page-input" inputMode="numeric" value={page} onChange={(e) => setPage(Math.min(pages, Math.max(1, Number(e.target.value) || 1)))} aria-label="Page number" />
          <span className="muted">of {pages || '…'}</span>
        </label>
        <button type="button" className="icon-btn" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page">
          <ChevronRight />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(-1)} aria-label="Zoom out">
          <ZoomOut />
        </button>
        <span className="num" style={{ minWidth: 52, textAlign: 'center' }}>
          {`${Math.round(shown * 100)}%`}
        </span>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1)} aria-label="Zoom in">
          <ZoomIn />
        </button>
        <button type="button" className="icon-btn" onClick={() => setZoom(null)} aria-label="Fit to width" aria-pressed={zoom === null}>
          <Maximize2 />
        </button>
      </div>
      <div ref={scroller} className="files-viewer-scroll">
        <div className="files-zoom">{doc ? <canvas ref={canvas} aria-label={`Page ${page} of ${pages}`} role="img" /> : <Spinner size={20} />}</div>
      </div>
    </div>
  );
}
