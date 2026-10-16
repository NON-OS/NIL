export default interface JoinDetails {
  mode: 'setup' | 'invite' | 'holder';
  name: string;
  workspaceName?: string;
  // setup only: false for an everyday team, which starts with the crypto tools hidden
  cryptoTools?: boolean;
  inviteToken?: string;
}
