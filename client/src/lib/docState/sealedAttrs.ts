import fileMeta from '../fileMeta';
import stripBidi from '../stripBidi';

// A picture's or file's details as they're shown and used, whatever another reader wrote into
// the doc: plain strings and numbers, a name that can't hide its real ending, sizes in range.
export default function sealedAttrs(attrs: Record<string, unknown>) {
  const { name, type } = fileMeta(stripBidi(String(attrs.name ?? '')), attrs.mime);
  const count = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);
  return {
    blob: typeof attrs.blob === 'string' ? attrs.blob : '',
    key: typeof attrs.key === 'string' ? attrs.key : '',
    mime: type,
    name: attrs.name == null || attrs.name === '' ? '' : name,
    alt: typeof attrs.alt === 'string' ? stripBidi(attrs.alt).slice(0, 2000) : '',
    size: count(attrs.size),
    width: count(attrs.width),
    height: count(attrs.height),
  };
}
