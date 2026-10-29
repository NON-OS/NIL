// A mention as it prints outside the editor: @ and the person's current name, or the label the
// mention was made with when the workspace doesn't know them.
export default function mentionName(attrs: Record<string, unknown> | undefined, people: (userId: string) => string) {
  const id = typeof attrs?.id === 'string' ? attrs.id : '';
  return `@${(id && people(id)) || attrs?.label || id || 'someone'}`;
}
