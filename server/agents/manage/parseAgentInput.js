import sql from '../../db/sql.js';
import config from '../../config.js';
import check from '../../lib/check.js';
import domain from '../../lib/domain.js';
import HttpError from '../../lib/HttpError.js';
import tools from '../../mcp/tools.js';
import resolveTarget from '../net/resolveTarget.js';
import defaultTools from './defaultTools.js';

const RUNNERS = ['external', 'anthropic', 'openai'];
const TOOL_NAMES = tools.map((t) => t.name);

const limit = (value, field, min, max) => (value === null || value === '' ? null : check.number(value, field, { min, max, integer: true }));
const price = (value, field) => (value === null || value === '' ? null : check.number(value, field, { min: 0, max: 1000 }));

// Validates an agent's settings from Settings → Agents. Only fields present in the body come
// back, so an edit changes just what it sends. `existing` is the agent being edited, if any.
export default async function parseAgentInput(body, existing = null) {
  const has = (key) => Object.hasOwn(body ?? {}, key);
  const out = {};
  if (has('name') || !existing) {
    out.name = check.text(body.name, 'Name', { min: 1, max: 60 });
    // names are how people @mention and assign, so they have to point at one member only
    if (sql.get('SELECT 1 FROM users WHERE deactivated = 0 AND lower(name) = lower(?) AND id != ?', out.name, existing?.id ?? '')) throw HttpError.badRequest('Someone in the workspace already has that name. Pick another, so mentions stay clear.');
  }
  if (has('color') || !existing) out.color = check.color(body.color ?? domain.colors[0]);
  if (has('description')) out.description = check.text(body.description, 'Description', { max: 200 });
  if (has('instructions')) out.instructions = check.text(body.instructions, 'Instructions', { max: 8000 });
  if (has('access') || !existing) out.access = check.oneOf(body.access ?? 'read', ['read', 'write'], 'Access');
  if (has('allProjects')) out.allProjects = Boolean(body.allProjects);
  if (has('projectIds')) {
    if (!Array.isArray(body.projectIds) || body.projectIds.length > 200) throw HttpError.badRequest('Projects must be a list.');
    out.projectIds = [...new Set(body.projectIds.filter((id) => typeof id === 'string'))];
    for (const id of out.projectIds) check.ref('projects', id, 'A project');
  }
  if (has('tools')) {
    if (!Array.isArray(body.tools)) throw HttpError.badRequest('Tools must be a list.');
    out.tools = [...new Set(body.tools)].filter((name) => TOOL_NAMES.includes(name));
  } else if (!existing) out.tools = defaultTools(out.access);

  if (has('runner') || !existing) out.runner = check.oneOf(body.runner ?? 'external', RUNNERS, 'How it runs');
  const runner = out.runner ?? existing?.runner;
  if (has('model')) out.model = check.text(body.model, 'Model', { max: 120 }) || null;
  if (has('endpoint')) out.endpoint = check.text(body.endpoint, 'Endpoint', { max: 500 }) || null;
  if (has('apiKey')) out.apiKey = check.text(body.apiKey, 'API key', { max: 500 });
  if (has('doneStatus')) out.doneStatus = body.doneStatus === null || body.doneStatus === '' ? null : check.oneOf(body.doneStatus, [...domain.statuses, 'none'], 'Status when done');
  if (has('maxSteps')) out.maxSteps = limit(body.maxSteps, 'Steps per run', 1, 100);
  if (has('maxRunTokens')) out.maxRunTokens = limit(body.maxRunTokens, 'Tokens per run', 1000, 10_000_000);
  if (has('maxDayTokens')) out.maxDayTokens = limit(body.maxDayTokens, 'Tokens per day', 1000, 100_000_000);
  if (has('rateLimit')) out.rateLimit = limit(body.rateLimit, 'Requests per minute', 1, 10_000);
  if (has('priceIn')) out.priceIn = price(body.priceIn, 'Input price');
  if (has('priceOut')) out.priceOut = price(body.priceOut, 'Output price');

  if (runner === 'anthropic' && !config.ai.enabled) throw HttpError.badRequest('The Anthropic runner needs ANTHROPIC_API_KEY set on the server.');
  if (runner === 'openai') {
    const endpoint = out.endpoint ?? existing?.endpoint;
    const model = out.model ?? existing?.model;
    if (!endpoint || !model) throw HttpError.badRequest('An OpenAI-compatible runner needs the endpoint URL and the model name.');
    if (out.endpoint) {
      try {
        await resolveTarget(out.endpoint, { allowLocal: config.agents.allowLocalEndpoints });
      } catch (err) {
        throw HttpError.badRequest(`Endpoint: ${err.message}`);
      }
    }
  }
  return out;
}
