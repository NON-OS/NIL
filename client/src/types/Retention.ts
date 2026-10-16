// Days to keep each kind of data; 0 keeps it forever.
export default interface Retention {
  doneDays: number;
  commentDays: number;
  activityDays: number;
}
