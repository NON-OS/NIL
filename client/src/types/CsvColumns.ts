// Which column of a CSV file holds which part of a task, by position. -1 means none.
export default interface CsvColumns {
  title: number;
  description: number;
  dueDate: number;
  person: number;
  project: number;
  status: number;
  priority: number;
  labels: number;
}
