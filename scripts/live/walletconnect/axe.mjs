import AxeBuilder from '@axe-core/playwright';

const SERIOUS = new Set(['serious', 'critical']);

// axe on what's on screen now: the serious and critical problems, if any, named after the state.
export default async function axe(page, name) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => SERIOUS.has(v.impact)).map((v) => `${name}: ${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
}
