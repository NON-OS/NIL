// What this workspace has paid the treasury for Nil Pro, and the published burn share.
export default interface Revenue {
  treasury: string | null;
  treasuryName: string;
  burnShare: number;
  burnReportUrl: string | null;
  tokens: { token: string; symbol: string; decimals: number; amount: string }[];
  usd: number;
  burnUsd: number;
}
