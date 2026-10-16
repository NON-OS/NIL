// Where a link inside a help page leads in the app. Links between docs files ("votes.md",
// "privacy-model.md#honest-limits") and anchors on the same page stay in the help center.
// Anything else, like a file elsewhere in the repository, has no page here and returns null.
export default function helpPath(href: string, current: string) {
  if (/^#[\w-]+$/.test(href)) return `/help${current ? `/${current}` : ''}${href}`;
  const doc = /^(?:\.\/)?([\w-]+)\.md(#[\w-]+)?$/.exec(href);
  if (!doc) return null;
  const [, slug, hash = ''] = doc;
  return `/help${slug === 'README' ? '' : `/${slug}`}${hash}`;
}
