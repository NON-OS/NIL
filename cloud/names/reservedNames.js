// Addresses nobody can sign up for: infrastructure names a browser or mail server might trust,
// names that would look official, and generic words worth keeping for the foundation. The
// operator adds more with CLOUD_RESERVED_NAMES and can still create any of them with the CLI.
const reservedNames = Object.freeze([
  'abuse', 'about', 'account', 'accounts', 'admin', 'administrator', 'alpha', 'api', 'app', 'apps', 'assets', 'auth',
  'autoconfig', 'autodiscover', 'beta', 'billing', 'blog', 'caddy', 'cdn', 'cloud', 'console', 'control', 'dashboard',
  'demo', 'dev', 'dns', 'docker', 'docs', 'download', 'email', 'example', 'foundation', 'ftp', 'git', 'health', 'help',
  'host', 'hosting', 'hostmaster', 'imap', 'internal', 'legal', 'localhost', 'login', 'mail', 'metrics', 'mx', 'news',
  'nil', 'noc', 'nonos', 'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'oauth', 'official', 'ops', 'panel', 'pay', 'payments', 'pop',
  'postmaster', 'privacy', 'proxy', 'register', 'root', 'rpc', 'security', 'server', 'signin', 'signup', 'smtp', 'sso',
  'staging', 'static', 'status', 'support', 'terms', 'test', 'verify', 'webmail', 'webmaster', 'wpad', 'www',
]);

export default reservedNames;
