import http from '../api/http';

// Throws away the file replacements uploaded for a task change that didn't go through. If even
// this fails, the server sweeps them up within the hour.
export default function discardStaged(taskId: string) {
  return http.del(`/tasks/${taskId}/attachments/staged`).catch(() => {});
}
