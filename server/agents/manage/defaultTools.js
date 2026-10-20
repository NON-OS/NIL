import tools from '../../mcp/tools.js';
import changesSomething from '../changesSomething.js';

// The tools an agent starts with: everything that only reads, plus everything that changes
// something when it may write. Admins narrow it from there.
export default function defaultTools(access) {
  return tools.filter((t) => access === 'write' || !changesSomething(t)).map((t) => t.name);
}
