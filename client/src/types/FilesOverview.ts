import type SharedFolder from './SharedFolder';

// The Files screen's top level: your shared folders, team folders whose key hasn't reached you
// yet, and how much of your file space you've used.
export default interface FilesOverview {
  folders: SharedFolder[];
  waiting: { id: string; createdBy: string | null; updatedAt: number }[];
  usage: { used: number; quota: number; maxFile: number };
}
