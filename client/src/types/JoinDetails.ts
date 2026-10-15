export default interface JoinDetails {
  mode: 'setup' | 'invite' | 'holder';
  name: string;
  workspaceName?: string;
  inviteToken?: string;
}
