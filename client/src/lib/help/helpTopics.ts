import type HelpTopic from '../../types/HelpTopic';

// The help center shows the same Markdown files as the docs folder in the repository, bundled
// at build time, so the app and the docs can't drift apart. docs/README.md is the index: its
// "##" headings become the groups and the order of its links sets the order of the topics.
const files = import.meta.glob<string>('../../../../docs/*.md', { query: '?raw', import: 'default', eager: true });

const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
const titleOf = (text: string, slug: string) => /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? slug;
const plainOf = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function groupsFrom(index: string) {
  const groups = new Map<string, string>();
  let group = 'Help';
  for (const line of index.split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) group = heading[1].trim();
    for (const link of line.matchAll(/\]\(([\w-]+)\.md(?:#[\w-]*)?\)/g)) if (!groups.has(link[1])) groups.set(link[1], group);
  }
  return groups;
}

const all = Object.entries(files).map(([path, text]) => ({ slug: slugOf(path), text }));
const index = all.find((f) => f.slug === 'README');
const groups = groupsFrom(index?.text ?? '');
const order = [...groups.keys()];
const rank = (slug: string) => (order.includes(slug) ? order.indexOf(slug) : order.length);

const topics: HelpTopic[] = all
  .filter((f) => f !== index)
  .map(({ slug, text }) => ({ slug, text, title: titleOf(text, slug), group: groups.get(slug) ?? 'More', plain: plainOf(text) }))
  .sort((a, b) => rank(a.slug) - rank(b.slug) || a.title.localeCompare(b.title));

const helpTopics = {
  topics,
  index: index ? { slug: '', text: index.text, title: titleOf(index.text, 'Help'), group: '', plain: plainOf(index.text) } : null,
  find: (slug: string) => topics.find((t) => t.slug === slug) ?? null,
};

export default helpTopics;
