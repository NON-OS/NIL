import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// A load hook for `node --test`. Components are .tsx, which Node can't strip on its own, so they
// are compiled with the project's TypeScript the way Vite would. Stylesheet imports become empty
// modules. Node's hook API needs this named export.
export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (!url.endsWith('.tsx')) return next(url, context);
  const options = { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
  const source = ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: options }).outputText;
  return { format: 'module', source, shortCircuit: true };
}
