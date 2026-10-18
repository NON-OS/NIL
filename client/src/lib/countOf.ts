// A count with its noun, singular or plural to match: "1 task", "2 tasks". Nouns that don't
// just take an s give their plural: countOf(n, 'person', 'people').
export default function countOf(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
