// A preset, or a rule in the small RRULE subset the server accepts, like FREQ=DAILY;INTERVAL=3.
type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | `FREQ=${string}`;
export default Recurrence;
