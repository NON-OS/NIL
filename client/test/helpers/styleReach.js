import fs from 'node:fs';
import path from 'node:path';

// Which stylesheets are sure to be loaded when a module renders: the ones the app's entry pulls
// in, the ones the module itself imports, and the ones every lazily loaded screen holding it
// imports. A class styled only somewhere else shows unstyled whenever that screen wasn't
// opened first.

const SOURCE = /\.(tsx?|jsx?)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) ?? null;
}

// Only rules made of one class and nothing else count as defining it. `.card .title` styles a
// title inside a card, which says nothing about a title anywhere else.
function definitions(cssFiles) {
  const defs = new Map();
  for (const file of cssFiles) {
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors] of text.matchAll(/([^{}@]+)\{/g)) {
      for (const selector of selectors.split(',')) {
        const own = selector.trim().match(/^\.(-?[_a-zA-Z][\w-]*)(::?[\w-]+(\([^)]*\))?)*$/);
        if (!own) continue;
        if (!defs.has(own[1])) defs.set(own[1], new Set());
        defs.get(own[1]).add(file);
      }
    }
  }
  return defs;
}

// Class names a module hands to className or cx(), as far as plain strings show them.
function classesUsed(file, defs) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => /className|cx\(/.test(l));
  const found = new Set();
  for (const [, , text] of lines.join('\n').matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    for (const word of text.split(/[\s${}]+/)) if (defs.has(word)) found.add(word);
  }
  return found;
}

export default function styleReach(srcDir, entry) {
  const files = walk(srcDir);
  const modules = files.filter((f) => SOURCE.test(f));
  const defs = definitions(files.filter((f) => f.endsWith('.css')));
  const imports = new Map();
  const lazy = new Set();
  for (const file of modules) {
    const text = fs.readFileSync(file, 'utf8');
    imports.set(file, [...text.matchAll(/^\s*(?:import|export)\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm)].map((m) => resolve(file, m[1])).filter(Boolean));
    for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const target = resolve(file, m[1]);
      if (target && SOURCE.test(target)) lazy.add(target);
    }
  }
  const closure = (root) => {
    const seen = new Set();
    for (const stack = [root]; stack.length; ) {
      const next = stack.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(imports.get(next) ?? []));
    }
    return seen;
  };
  const always = closure(entry);
  const screens = [...lazy].map(closure);

  const unstyled = [];
  for (const file of modules) {
    const loaded = new Set([...always, ...closure(file)]);
    const holders = screens.filter((screen) => screen.has(file));
    if (!always.has(file) && holders.length) for (const css of holders[0]) if (holders.every((h) => h.has(css))) loaded.add(css);
    for (const name of classesUsed(file, defs)) {
      if (![...defs.get(name)].some((css) => loaded.has(css))) unstyled.push(`${path.relative(srcDir, file)} uses .${name}, styled only in ${[...defs.get(name)].map((css) => path.relative(srcDir, css)).join(', ')}`);
    }
  }
  return unstyled.sort();
}
