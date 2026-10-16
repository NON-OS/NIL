// Closed tasks nobody has touched since `before` stay on the server until a view asks for
// them. `cursor` ("<updatedAt>.<id>" of the last one loaded) is where the next page starts,
// null once there's nothing older left to load. `done` counts the archived tasks each goal and
// project has finished, loaded or not, for progress.
export default interface TaskArchive {
  before: number;
  cursor: string | null;
  done: { goals: Record<string, number>; projects: Record<string, number> };
}
