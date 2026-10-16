import tools from '../../mcp/tools.js';

// The tools an agent starts with: everything that reads, plus everything that writes when it may
// write. Admins narrow it from there.
export default function defaultTools(access) {
  return tools.filter((t) => access === 'write' || !t.write).map((t) => t.name);
}
