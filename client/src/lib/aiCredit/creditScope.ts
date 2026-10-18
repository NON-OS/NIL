import fieldOf from './fieldOf';

// The scope of one AI credit: one slot of one UTC day in this workspace. Worked out here from
// values every member shares, never taken from the server, so a server can't hand one person
// scopes nobody else uses and so pick out their requests.
export default function creditScope(workspaceKey: string, day: string, slot: number) {
  return fieldOf(`nil/ai-credit/v1|scope|${workspaceKey}|${day}|${slot}`);
}
