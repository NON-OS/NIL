import type SignInMethod from './SignInMethod';

export default interface SecurityOverview {
  shareWallet: boolean;
  credentials: SignInMethod[];
}
