import fs from 'node:fs';

// The release version, read once from package.json so it's written in one place only.
const appVersion = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export default appVersion;
