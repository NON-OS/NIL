import type PreviewKind from '../types/PreviewKind';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_TYPES = /^(text\/(?!html$)[\w.+-]+|application\/(json|xml|yaml|x-yaml|toml|javascript|typescript|x-sh|x-python|sql|x-httpd-php|ld\+json))$/;
const CODE = /\.(txt|log|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|cfg|conf|env|js|mjs|cjs|jsx|ts|tsx|css|scss|less|html?|vue|svelte|sh|bash|zsh|ps1|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sql|lua|pl|r|dart|ex|exs|erl|hs|scala|clj|sol|tf|proto|graphql|gitignore|dockerfile|makefile)$/i;

// How a file is shown in the browser once it's decrypted, decided by its signed type and, for
// text a browser types loosely, its name. SVG is never an image here: it can carry script, so
// it's a plain file to download, like anything else without a preview.
export default function previewKind(type: string, name: string): PreviewKind {
  if (/^image\/(png|jpeg|gif|webp|avif)$/.test(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type === DOCX || (/\.docx$/i.test(name) && type === 'application/octet-stream')) return 'docx';
  if (type === 'image/svg+xml' || /\.svg$/i.test(name)) return 'none';
  if (type === 'text/markdown' || /\.(md|markdown)$/i.test(name)) return 'markdown';
  if (/^audio\//.test(type)) return 'audio';
  if (/^video\//.test(type)) return 'video';
  if (TEXT_TYPES.test(type) || type === 'text/html' || CODE.test(name)) return 'text';
  return 'none';
}
