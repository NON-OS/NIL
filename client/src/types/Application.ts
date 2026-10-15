export default interface Application {
  id: string;
  taskId: string;
  address: string;
  name: string;
  pitch: string;
  status: 'pending' | 'accepted' | 'declined' | 'closed';
  createdAt: number;
}
