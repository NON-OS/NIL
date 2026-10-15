import type Comment from './Comment';
import type Activity from './Activity';
import type Attachment from './Attachment';

export default interface TaskDetail {
  taskId: string;
  loading: boolean;
  comments: Comment[];
  activity: Activity[];
  attachments: Attachment[];
  watchers: string[];
}
