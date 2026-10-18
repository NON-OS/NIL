export default interface PublicBounty {
  id: string;
  ref: string;
  title: string;
  summary: string;
  reward: { amount: string; symbol: string; decimals: number; token: string };
  due: string | null;
  listedAt: string;
  applicants: number;
  // false once the team stops taking applications; the bounty stays listed
  acceptingApplications: boolean;
}
