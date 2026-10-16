// This device's push settings as the server holds them, and how many devices have push on.
export default interface PushState {
  device: { showNames: boolean; timeZone: string | null } | null;
  devices: number;
}
