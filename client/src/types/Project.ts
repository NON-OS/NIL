export default interface Project {
  id: string;
  name: string;
  key: string;
  color: string;
  description: string;
  leadId: string | null;
  archived: boolean;
  position: number;
  createdAt: number;
}
