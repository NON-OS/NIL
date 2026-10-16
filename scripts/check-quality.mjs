// House rules the build enforces, so they hold after we stop paying attention:
//   one export per module, files small enough to read in one go, no stubs or TODOs left in,
//   no model names in the repository, logging through server/lib/log.js, and writing that
//   doesn't read like it came out of a template (see Wikipedia's "Signs of AI writing").
// Usage: node scripts/check-quality.mjs   (exits 1 and lists every problem)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.claude', 'data', 'zk', 'fixtures', 'marketing', 'circuits']);
const SOURCE_LINES = 300;
const TEST_LINES = 450;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((full) => ({ full, rel: path.relative(ROOT, full) }));
const isCode = (f) => /\.(js|mjs|cjs|ts|tsx)$/.test(f.rel);
const isTest = (f) => /(^|\/)test\//.test(f.rel) || /\.test\.[jt]sx?$/.test(f.rel);
const isScript = (f) => /^(scripts|deploy)\//.test(f.rel) || /^cloud\/cli/.test(f.rel);
const isModule = (f) => isCode(f) && /^(server|client\/src|cloud)\//.test(f.rel) && !isScript(f);
// this file names every pattern it looks for, so it is the one file it doesn't read
const SELF = 'scripts/check-quality.mjs';

const problems = [];
const report = (f, line, what) => problems.push(`${f.rel}${line ? `:${line}` : ''}  ${what}`);

// Words and constructions that give machine-written text away. Kept short on purpose: each one
// here has to be worth a failed build.
const TELLS = /\b(delve|delves|delving|tapestry|testament to|seamless(ly)?|leverag(e|es|ing)|cutting-edge|state-of-the-art|game-?changer|unlock the power|harness(es|ing)? the power|in today's|it'?s worth noting|it is important to note|in conclusion|vibrant|meticulous(ly)?|bespoke|nestled|boasts|underscores? (the|how|that)|ever-evolving|rest assured|look no further)\b/i;
const MODEL_ID = /\b(claude-(opus|sonnet|haiku|fable|instant|\d)[\w.-]*|gpt-\d[\w.-]*|gemini-\d[\w.-]*)/i;

for (const f of files.filter((x) => isCode(x) && x.rel !== SELF)) {
  const text = fs.readFileSync(f.full, 'utf8');
  const lines = text.split('\n');
  if (isModule(f)) {
    const exports = (text.match(/^export\s+(default\b|(async\s+)?(const|let|var|function\*?|class)\s|\{)/gm) || []).length;
    if (exports > 1) report(f, 0, `${exports} exports; one module, one export`);
  }
  const limit = isTest(f) ? TEST_LINES : SOURCE_LINES;
  if (lines.length > limit) report(f, 0, `${lines.length} lines; split it below ${limit}`);
  lines.forEach((line, i) => {
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) report(f, i + 1, 'TODO left in');
    if (!isTest(f) && /not implemented|coming soon|lorem ipsum/i.test(line)) report(f, i + 1, 'stub wording');
    if (MODEL_ID.test(line)) report(f, i + 1, 'model name in the repository; take it from settings');
    if (!isTest(f) && /^server\//.test(f.rel) && /\bconsole\.(log|debug|info|warn|error)\(/.test(line) && !/lib\/log\.js$/.test(f.rel)) {
      report(f, i + 1, 'console call; use server/lib/log.js');
    }
    if (/^client\/src\//.test(f.rel) && /\bconsole\.(log|debug|info)\(/.test(line)) report(f, i + 1, 'console call left in the web app');
    if (/—/.test(line)) report(f, i + 1, 'em dash');
    if (/^client\/src\//.test(f.rel) && /['"`>]/.test(line) && TELLS.test(line)) report(f, i + 1, `"${line.match(TELLS)[0]}" in interface text`);
  });
}

for (const f of files.filter((x) => x.rel.endsWith('.md'))) {
  let fenced = false;
  fs.readFileSync(f.full, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    if (/—/.test(line)) report(f, i + 1, 'em dash');
    if (TELLS.test(line)) report(f, i + 1, `"${line.match(TELLS)[0]}"`);
    if (MODEL_ID.test(line)) report(f, i + 1, 'model name in the repository');
    if (/^\s*[-*]\s+\*\*[^*]+\*\*[:.]?\s/.test(line)) report(f, i + 1, 'bullet that starts with a bold label; write it as a sentence');
    if (/\b(TODO|TBD|FIXME)\b/.test(line)) report(f, i + 1, 'TODO left in');
  });
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Quality check passed: ${files.filter(isCode).length} code files, ${files.filter((x) => x.rel.endsWith('.md')).length} docs.`);
