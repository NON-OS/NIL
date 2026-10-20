// Whether a tool changes anything at all, which a read-only key may never do. Tools that write
// change the workspace; tools that only mutate (following a task, marking the inbox read) change
// what the caller hears about, and that's still a change a read-only key promised not to make.
export default function changesSomething(tool) {
  return Boolean(tool.write || tool.mutates);
}
