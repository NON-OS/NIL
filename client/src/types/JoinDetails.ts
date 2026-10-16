export default interface JoinDetails {
  mode: 'setup' | 'invite' | 'holder';
  name: string;
  workspaceName?: string;
  inviteToken?: string;
  // the one-time token that claims a fresh server (setup only)
  setupToken?: string;
}
