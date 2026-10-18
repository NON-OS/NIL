// The networks the verifier knows: each one's chain ID and the beacon chain's genesis time, in
// seconds. Slots are 12 seconds on all of them. These are fixed by each network and never change.
const beaconNetworks = Object.freeze({
  mainnet: Object.freeze({ chainId: 1, genesisTime: 1606824023 }),
  sepolia: Object.freeze({ chainId: 11155111, genesisTime: 1655733600 }),
  hoodi: Object.freeze({ chainId: 560048, genesisTime: 1742213400 }),
});

export default beaconNetworks;
