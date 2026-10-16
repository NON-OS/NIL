export default interface ImportProgress {
  total: number;
  done: number;
  failed: number;
  // the first few reasons tasks couldn't be imported, to show the person
  errors: string[];
  finished: boolean;
  stopped: boolean;
}
