export default interface ToastMessage {
  id: number;
  message: string;
  tone: 'default' | 'error' | 'success';
  action?: { label: string; run: () => void };
  timeout: number;
}
