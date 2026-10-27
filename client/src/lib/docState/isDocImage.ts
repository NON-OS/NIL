// The pictures a doc shows inline. Anything else, SVG included, is attached as a file.
export default function isDocImage(type: string) {
  return /^image\/(png|jpeg|gif|webp)$/.test(type);
}
