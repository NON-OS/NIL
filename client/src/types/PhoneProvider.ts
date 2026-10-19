import type Eip1193Provider from './Eip1193Provider';

// A phone wallet behind the usual wallet interface, plus what the screen shows about it.
export default interface PhoneProvider extends Eip1193Provider {
  address(): string | null;
  chainId(): number;
  // stops listening and turns down anything still waiting, without telling the phone
  close(reason?: string): void;
}
