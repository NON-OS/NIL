import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The web app's components are .tsx, which Node can't strip on its own. These hooks compile them
// with the project's TypeScript the way Vite would, and turn stylesheet imports into nothing, so
// the real Markdown renderer runs here exactly as it runs in the browser.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$|\.css$/.test(specifier)) {
      for (const ext of ['.ts', '.tsx']) {
        try {
          return nextResolve(`${specifier}${ext}`, context);
        } catch {}
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) {
      const source = ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: Markdown } = await import('../src/components/ui/Markdown.tsx');

const render = (text) => renderToStaticMarkup(createElement(Markdown, { text }));

// What people can type into a task title, description, comment, doc or name. Every one is
// rendered through the real Markdown component, the same one share pages, comments and docs use.
const SCHEMES = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'javascript&colon;alert(1)', '&#106;avascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'data:image/svg+xml,<svg/onload=alert(1)>', 'file:///etc/passwd', '//evil.example/x', '\\\\evil.example\\x'];
const CORPUS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg/onload=alert(1)>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<iframe srcdoc="<script>alert(1)</script>">',
  '<a href="javascript:alert(1)">x</a>',
  '<style>body{background:url(javascript:alert(1))}</style>',
  '<base href="https://evil.example/">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<form action="https://evil.example"><button>Sign in</button></form>',
  '"><img src=x onerror=alert(1)>',
  "'><svg onload=alert(1)>",
  '`<script>alert(1)</script>`',
  '```\n</code></pre><script>alert(1)</script>\n```',
  '# <img src=x onerror=alert(1)>',
  '| <script>alert(1)</script> | b |\n|---|---|\n| <img src=x onerror=alert(1)> | c |',
  '- [x] <script>alert(1)</script>',
  '> <iframe src=javascript:alert(1)>',
  '**<script>alert(1)</script>**',
  '@<script>alert(1)</script>',
  '[click](https://ok.example"onmouseover="alert(1))',
  '[click](https://ok.example/"><script>alert(1)</script>)',
  'https://ok.example/"onmouseover="alert(1)',
  'https://ok.example/<script>alert(1)</script>',
  '![x](javascript:alert(1))',
  '[x](<javascript:alert(1)>)',
  '[[x](javascript:alert(1))](https://ok.example)',
  '**[x](javascript:alert(1))**',
  '[x](https://ok.example) [y](javascript:alert(1))',
  '‮gnp.exe‬ [link](https://ok.example)',
  '{{constructor.constructor("alert(1)")()}}',
  ...SCHEMES.map((s) => `[click me](${s})`),
  ...SCHEMES.map((s) => `*[click me](${s})*`),
];

const TAGS = /<(script|iframe|img|svg|math|style|object|embed|form|base|meta|link|input(?![^>]*type="checkbox"[^>]*disabled)|button|video|audio|source|noscript|template)\b/i;

function assertInert(html, payload) {
  const why = `payload ${JSON.stringify(payload)} rendered as ${html}`;
  // text never contains a raw <, so every < left in the output opens a real element
  const tags = html.match(/<[a-z][^>]*>/gi) ?? [];
  for (const tag of tags) {
    assert.doesNotMatch(tag, TAGS, why);
    assert.doesNotMatch(tag, /\son[a-z]+\s*=/i, why);
    assert.doesNotMatch(tag, /\s(src|srcdoc|style|action|formaction)\s*=/i, why);
  }
  // a quote inside a URL stays escaped as &quot;, so the value ends at the first real quote
  for (const [, href] of html.matchAll(/\shref="([^"]*)"/gi)) {
    const decoded = href.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    assert.match(decoded, /^(https?:\/\/|mailto:)/i, `href ${href} from ${why}`);
  }
}

test('no payload in the corpus renders as markup, script, an event handler or a script link', () => {
  for (const payload of CORPUS) {
    for (const text of [payload, `before ${payload} after`, `- ${payload}`, `# ${payload}`, `> ${payload}`, `| a |\n|---|\n| ${payload} |`]) {
      assertInert(render(text), text);
    }
  }
});

test('payloads that aren’t web or mail links show up as their own text', () => {
  const html = render('[click me](javascript:alert(1))');
  assert.match(html, /click me/);
  assert.doesNotMatch(html, /<a\b/);
  assert.match(render('<script>alert(1)</script>'), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('web and mail links keep working, open in a new tab and send no opener or referrer', () => {
  const html = render('[docs](https://nil.example/a?b=1&c=2) and mailto:ana@example.com [mail](mailto:ana@example.com) https://nil.example/x');
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 3);
  for (const a of links) {
    assert.match(a, /rel="noopener noreferrer nofollow"/);
    assert.match(a, /target="_blank"/);
  }
});

test('random markup soup never yields an active element (fuzz)', () => {
  const parts = ['<', '>', '"', "'", '`', '(', ')', '[', ']', '*', '_', '~', '|', '#', '>', '\n', ' ', '@', 'script', 'svg', 'img', 'onerror=', 'href=', 'javascript:', 'data:', 'https://x.example/', 'mailto:', 'alert(1)', '&#x3C;', '\u0000', '‮', '-', '1.', '```'];
  let seed = 1234567;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  for (let n = 0; n < 3000; n++) {
    let text = '';
    const length = 1 + (next() % 30);
    for (let i = 0; i < length; i++) text += parts[next() % parts.length];
    assertInert(render(text), text);
  }
});
