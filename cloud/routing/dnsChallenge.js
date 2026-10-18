// Modules that take their credentials as a block of named values rather than one token. Each
// value is read from Caddy's own environment, under the name docker-compose.yml passes it as.
const BLOCKS = Object.freeze({
  ovh: Object.freeze([
    ['endpoint', 'OVH_ENDPOINT'],
    ['application_key', 'OVH_APPLICATION_KEY'],
    ['application_secret', 'OVH_APPLICATION_SECRET'],
    ['consumer_key', 'OVH_CONSUMER_KEY'],
  ]),
});

// The `dns` directive of the wildcard certificate's tls block, one line per entry. Credentials
// are runtime placeholders, so they stay in Caddy's environment and never reach the generated
// file or the control plane.
export default function dnsChallenge(provider, tokenEnv) {
  const block = BLOCKS[provider];
  if (!block) return [`dns ${provider} {env.${tokenEnv}}`];
  return [`dns ${provider} {`, ...block.map(([key, env]) => `\t${key} {env.${env}}`), '}'];
}
