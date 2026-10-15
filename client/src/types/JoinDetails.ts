export default interface JoinDetails {
  mode: 'setup' | 'invite';
  name: string;
  workspaceName?: string;
  inviteToken?: string;
}
