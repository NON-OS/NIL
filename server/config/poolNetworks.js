// The Privacy Pools deployments by 0xbow that Nil knows, as read from the official app and the
// chain on 18 October 2026. Pools are keyed by the token they hold, so they line up with the
// reward tokens a server pays in whatever symbol it gives them. Mainnet has no relayer default:
// the operator picks one. The association set provider and relayer below are 0xbow's own.
const poolNetworks = Object.freeze({
  mainnet: Object.freeze({
    chainId: 1,
    entrypoint: '0x6818809eefce719e480a7526d76bd3e561526b46',
    pools: Object.freeze({
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '0xb419c2867ab3cbc78921660cb95150d95a94ce86',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': '0xe859c0bd25f260baee534fb52e307d3b64d24572',
      '0x6b175474e89094c44da98b954eedeac495271d0f': '0x1c31c03b8cb2ee674d0f11de77135536db828257',
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': '0xf973f4b180a568157cd7a0e6006449139e6bfc32',
      '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': '0x1a604e9dfa0efdc7ffda378af16cb81243b61633',
      '0xdc035d45d973e3ec169d2276ddab16f1e407384f': '0x05e4dbd71b56861eed2aaa12d00a797f04b5d3c0',
      '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd': '0xbbda2173cdfea1c3bd7f2908798f1265301d750c',
    }),
    relayer: null,
    asp: 'https://api.0xbow.io',
  }),
  sepolia: Object.freeze({
    chainId: 11155111,
    entrypoint: '0x34a2068192b1297f2a7f85d7d8cde66f8f0921cb',
    pools: Object.freeze({
      '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': '0x0b062fe33c4f1592d8ea63f9a0177fca44374c0f',
      '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0': '0x6709277e170dee3e54101cdb73a450e392adff54',
    }),
    relayer: 'https://testnet-relayer.privacypools.com',
    asp: 'https://dw.0xbow.io',
  }),
});

export default poolNetworks;
