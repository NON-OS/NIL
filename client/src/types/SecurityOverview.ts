import type SignInMethod from './SignInMethod';

export default interface SecurityOverview {
  email: string | null;
  hasPassword: boolean;
  shareWallet: boolean;
  credentials: SignInMethod[];
}
