// A file's name with its real ending always in view: a long name is cut short before the
// extension, never through it, so "invoice.pdf          .exe" can't pass for a PDF.
export default function FileName({ name, file }: { name: string; file: boolean }) {
  const dot = file ? name.lastIndexOf('.') : -1;
  if (dot <= 0 || name.length - dot > 12) return <strong title={name}>{name}</strong>;
  return (
    <strong className="files-name-split" title={name}>
      <span className="files-name-base">{name.slice(0, dot)}</span>
      <span className="files-name-ext">{name.slice(dot)}</span>
    </strong>
  );
}
