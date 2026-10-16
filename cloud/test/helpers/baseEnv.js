// The smallest complete configuration, as the tests' starting point.
const baseEnv = Object.freeze({
  CLOUD_DOMAIN: 'nil.test',
  CLOUD_APP_IMAGE: 'nonos/nil:1.0.0',
  CLOUD_RPC_URL: 'https://rpc.test/v1/key',
  CLOUD_CADDY_CONTAINER: 'nil-caddy',
  CLOUD_PLAN_TREASURY: `0x${'7'.repeat(40)}`,
  CLOUD_INVOICE_KEY: 'k'.repeat(64),
  CLOUD_SOURCE_URL: 'https://source.test/nil',
  CLOUD_POW_BITS: '4',
});

export default baseEnv;
