// Token counts and cost estimates, short enough for a stat tile: "12.4k", "1.2M", "$0.42".
const formatUsage = {
  tokens(n: number) {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
    return `${(n / 1_000_000).toFixed(1)}M`;
  },

  cost(dollars: number) {
    if (!dollars) return '$0';
    return dollars < 0.01 ? '<$0.01' : `$${dollars.toFixed(2)}`;
  },
};

export default formatUsage;
