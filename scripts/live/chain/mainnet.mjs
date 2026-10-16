// The mainnet contracts Nil defaults to (server/config.js) and a few real holders to fund test
// wallets from on a fork. Holders move their funds, so each list has fallbacks and the first one
// that still holds enough is used.
const mainnet = Object.freeze({
  nox: '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca',
  staking: '0xa94d6009790ba13597a1e1b7cf4e1531ea513613',
  zsp: '0x7b575dd8e8b111c52ab1e872924d4efd4df403df',
  usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  announcer: '0x55649e01b5df198d18d95b5cc5051630cfd45564',
  weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  ethUsdFeed: '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419',
  noxWethV2Pair: '0x07ce5889d2eb681af3bd61db24ab2602c502bd1b',
  coinbaseWalletFactory: '0x0ba5ed0c6aa8c49038f819e587e2633c4a9f428a',
  // holds NOX's GOVERNOR_ROLE, which sets the token's fees
  noxGovernor: '0x3a52ea60f61036afbbec25f46a64485ac4477ccc',
  holders: Object.freeze({
    nox: ['0xd548558a7e2666d5580125448b446358f5990423', '0x2794b7535708029c1405c60f56df57144e5c53c0', '0x88c5863e537e9f2103f320df6c191b22980da537'],
    usdc: ['0x37305b1cd40574e4c5ce33f8e8306be057fd7341', '0x55fe002aeff02f77364de339a1292923a15844b8'],
    zsp: ['0xa5be71d873ad46050317cb72346a59d0346b14ea', '0x6da336c6052c385d8c74ee60b0ad14b3d8026311'],
    // stakers with millions of NOX in unlocked positions, for when the holders above run dry
    noxStakers: ['0xa5be71d873ad46050317cb72346a59d0346b14ea'],
  }),
  // archive-capable public endpoints; a fork reads old state lazily, which the default public
  // node refuses past about 128 blocks
  forkUrls: ['https://eth.drpc.org', 'https://eth-mainnet.public.blastapi.io'],
});

export default mainnet;
