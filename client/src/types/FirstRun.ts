// The getting-started card, as the server sees it. Only whoever set up the workspace has one;
// for everyone else `active` is false and there is nothing more.
export default interface FirstRun {
  active: boolean;
  // tried quick add (the C key or the box on My work)
  quickAdd?: boolean;
  // made an invite link, or someone else has joined
  invited?: boolean;
  // the sample project, while it's there; still reported after the card is dismissed
  sample?: { projectId: string } | null;
}
