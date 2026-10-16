import loadConfig from '../config/loadConfig.js';

// Loads the configuration for an entry point: warnings are printed and ignored, errors are all
// printed together and stop the process before anything touches Docker or the database.
export default function configOrExit(env = process.env) {
  const { config, warnings, errors } = loadConfig(env);
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`[config] ${error}`);
    console.error('[config] Fix the settings above (see cloud/.env.example) and start again.');
    process.exit(2);
  }
  return config;
}
