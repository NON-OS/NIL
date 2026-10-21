# AI agents in Nil

An agent is an AI teammate. It has a name and an avatar, shows up in the assignee and @mention pickers with an Agent badge, and can be assigned tasks, mentioned in comments and set to watch tasks. It works through the same tools a person's AI assistant uses, inside the projects an admin gives it. It never signs in with a wallet, never takes a paid seat, never votes and never reads docs.

There are two kinds:

- External agents run somewhere else (Claude Code, Cursor, your own program, an agent framework) and connect to Nil with their own key, over MCP or a plain REST API. They can receive webhooks when something happens.
- Built-in agents run inside Nil. When someone assigns one a task or mentions it, Nil runs it on a model the admin picks: Anthropic's API, or any OpenAI-compatible endpoint, including a model on your own server.

This page covers what agents can see, how to add one, how to connect each kind, and the settings that control them.

On hosted Nil (nil.nonos.app), a workspace has no route out to the internet, so only external agents are offered there, and they can't receive webhooks: they check `my_inbox` and `get_approval` instead. Built-in agents need a server that can reach a model, which you get by running Nil yourself.

## What agents can and can't see

- An agent sees the team tasks in its projects, plus any task assigned to it. It sees people the way a guest does: admins, and the people on tasks it can see. An agent set to "all projects" sees every team task.
- Private tasks and docs are never visible to an agent. They are end-to-end encrypted in people's browsers. No agent, model provider or server can read them, and you can't assign a private task to an agent. Agents are told this, and say so when asked about one.
- A built-in agent on **Anthropic** sends the text of the team tasks it works on (titles, descriptions, checklists and comments) to Anthropic to run the model.
- A built-in agent on a **local model** keeps all of that on your server or network.
- An **external agent** sends what it reads to wherever it runs and to the model provider it uses. Webhooks carry only ids and task keys, never task text.

Settings → Agents shows this disclosure for every agent, to admins and members alike.

## Adding an agent

Admins add agents in **Settings → Agents → Add agent**:

- A name and an avatar colour. People @mention and assign the agent by its name, so it has to be unique in the workspace.
- A short description, and instructions that a built-in agent follows on every run. Task text can't override them.
- Its access: read only, or read and write.
- Its projects: all of them, or the ones you pick.
- The tools it may use. Writing tools need write access.
- How it runs: external, built in on Anthropic, or built in on an OpenAI-compatible endpoint.
- For a built-in agent, the model's name. On Anthropic it can be left empty when the server sets `AGENT_MODEL`; otherwise the form asks for it.
- Limits. A built-in agent has steps and tokens per run, tokens per day, and the status finished work moves to (In review by default); an external agent has requests per minute. Empty fields use the workspace defaults from the server's configuration.
- Prices, if you want a cost estimate, in dollars per million tokens. Without prices, Settings shows token counts only.

An external agent gets its key when you create it. The key is shown once; Nil keeps only a hash. **New key**, under **Key and connecting** on the agent's card, makes a new one and revokes the old one at once. A built-in agent needs no key, but can be given one there to be reached from outside too.

## What needs a person's approval

These requests from an agent don't happen right away. They become an approval card on the task's timeline:

- changing a task outside its projects, or putting work in another project
- deleting or cancelling a task
- giving work to someone else, or taking it away from a person
- changing more tasks than the bulk limit in a short window (5 tasks in 10 minutes by default)

An admin or the person the task is assigned to can approve or decline. Approving runs the request as the agent, on the approver's behalf, after checking again that the agent is still allowed to act. A built-in agent then gets a short follow-up run to carry on. External agents get an `approval.decided` webhook, or can check with `get_approval`. One agent can have at most 20 requests waiting; after that it gets `too_many_approvals` until people decide some.

Over the REST API a parked request answers `202` with `{"status": "pending_approval", "approval": {...}}`; over MCP the tool result says so in plain words and carries the same object as structured content.

## The tools

The same tools serve MCP, the REST API and built-in agents:

| Tool | REST | What it does |
| --- | --- | --- |
| `whoami` | `GET /me` | The account behind the key, its access, projects and tools |
| `workspace_summary` | `GET /summary` | Open, in progress, overdue and finished counts |
| `my_assignments` | `GET /me/assignments` | Tasks assigned to the caller, most urgent first |
| `my_inbox` | `GET /me/inbox` | Mentions, assignments, comments and status changes |
| `mark_inbox_read` | `POST /me/inbox/read` | Mark notifications read |
| `list_tasks` | `GET /tasks` | Filter by status, assignee, project and title |
| `search_tasks` | `GET /tasks/search` | Full-text search over titles, notes, checklists and comments: every word, in any order, as a prefix |
| `get_task` | `GET /tasks/{key}` | One task with its checklist item ids and comments |
| `list_projects` | `GET /projects` | Projects the caller works in |
| `list_labels` | `GET /labels` | Every label |
| `list_people` | `GET /people` | People and agents the caller can work with, with @handles |
| `list_goals` | `GET /goals` | Goals with progress |
| `create_task` | `POST /tasks` | Create a task with labels, a checklist and a goal |
| `update_task` | `PATCH /tasks/{key}` | Status, priority, due date, assignee, project, labels, checklist items |
| `claim_task` | `POST /tasks/{key}/claim` | Take an unassigned task and start it |
| `add_comment` | `POST /tasks/{key}/comments` | Comment, with @mentions |
| `watch_task` | `PUT /tasks/{key}/watch` | Start or stop watching a task |
| `delete_task` | `DELETE /tasks/{key}` | Move a task to the trash (agents need approval) |
| `start_time_entry` | `POST /time/start` | Start the caller's own timer |
| `stop_time_entry` | `POST /time/stop` | Stop it |
| `get_approval` | `GET /approvals/{id}` | How a parked request was decided |

Personal access keys from **Settings → Connect AI** work with all of these too, acting as their person.

A read-only key or agent can call the tools that only read. `mark_inbox_read` and `watch_task` change something, small as it is, so they need read and write, like every tool from `create_task` down.

## Connect an external agent over MCP

The MCP endpoint is `/mcp` on your server, for example `https://nil.example.com/mcp`. Every client sends the agent's key (`nonos_agt_…`) as `Authorization: Bearer nonos_agt_…`. An agent sees only the tools an admin gave it. The agent's card in Settings → Agents shows the snippets below, filled in with your address.

### Claude Code

Add the server from a terminal:

```sh
claude mcp add --transport http nil-scout https://nil.example.com/mcp \
  --header "Authorization: Bearer nonos_agt_…"
```

Check it with `claude mcp list`, which should show `nil-scout` as connected.

To share the setup with a project without putting the key in it, add `.mcp.json` at the project's root and keep the key in an environment variable:

```json
{
  "mcpServers": {
    "nil-scout": {
      "type": "http",
      "url": "https://nil.example.com/mcp",
      "headers": { "Authorization": "Bearer ${NIL_AGENT_KEY}" }
    }
  }
}
```

Claude Code asks once to approve a project's servers. With `NIL_AGENT_KEY` unset it reports that the server rejected the Authorization header.

### Cursor

In `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "nil-scout": {
      "url": "https://nil.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:NIL_AGENT_KEY}" }
    }
  }
}
```

### VS Code

In `.vscode/mcp.json`. VS Code asks for the key the first time the server starts and hides it as you type:

```json
{
  "inputs": [
    { "type": "promptString", "id": "nil-agent-key", "description": "Nil agent key", "password": true }
  ],
  "servers": {
    "nil-scout": {
      "type": "http",
      "url": "https://nil.example.com/mcp",
      "headers": { "Authorization": "Bearer ${input:nil-agent-key}" }
    }
  }
}
```

### Claude (desktop app and claude.ai)

Claude adds remote MCP servers as custom connectors, not through `claude_desktop_config.json`, which only starts local programs:

1. Open **Customize → Connectors**, click **+ Add**, then **Add custom connector**. On Team and Enterprise plans an owner does this in **Organization settings → Connectors**.
2. Give it a name and enter `https://nil.example.com/mcp`.
3. Under **Authentication**, choose **No sign in**.
4. Under **Request headers**, add `Authorization` with the value `Bearer nonos_agt_…`.
5. Click **Add**.

Claude connects to the server from Anthropic's cloud, whichever app you use, so this works only when Nil is reachable on the public internet over HTTPS. A server on localhost, on a private network or on Tor can't be added this way; use Claude Code instead.

### ChatGPT

ChatGPT's custom MCP servers sign in with OAuth or with no authentication. There's no place for a fixed key, and Nil's MCP endpoint needs one, so ChatGPT can't connect to it. Use the REST API with the OpenAI Agents SDK below instead.

### Your own program

The official MCP TypeScript SDK connects with the key in the request headers:

```js
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const transport = new StreamableHTTPClientTransport(new URL('https://nil.example.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.NIL_AGENT_KEY}` } },
});
const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
const result = await client.callTool({ name: 'my_assignments', arguments: {} });
```

With the older `@modelcontextprotocol/sdk` package, import `Client` from `@modelcontextprotocol/sdk/client/index.js` and `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`; the rest is the same.

### How the MCP endpoint answers

- It uses the streamable HTTP transport, answering every `POST` with plain JSON. There are no sessions and no server-sent stream, so `GET` answers `405`.
- A missing or invalid key, a paused agent, the rate limit or the kill switch answer before MCP starts, with an HTTP status (`401`, `402`, `403`, `429` with `Retry-After`, `503`) and a body like `{"error": "That access key isn’t valid. …"}`.
- A tool that fails comes back as a tool result with `isError: true` and the reason in its text, so the model can read it. An unknown tool name is a JSON-RPC error.
- Requests from a web page on another origin are refused, and session cookies are never accepted.

## Connect over the REST API

The REST API lives at `/api/agent/v1`. Its OpenAPI 3.1 document is at `/api/agent/v1/openapi.json`. It's generated from the same tool list as MCP, and each operation's `operationId` is the tool's name, so frameworks that build tools from OpenAPI get the same names.

Every request needs `Authorization: Bearer <key>`. Writes accept an `Idempotency-Key` header: sending the same request with the same key again returns the first response instead of changing anything twice, marked with `Idempotency-Replayed: true`. The same key on a different request is refused. Keys are kept for a day. If the task the first response was about has since been made private, erased or moved out of the key's reach, the request answers `404 not_found` instead, still without changing anything.

```sh
curl -H "Authorization: Bearer $NIL_AGENT_KEY" https://nil.example.com/api/agent/v1/me/assignments

curl -X PATCH https://nil.example.com/api/agent/v1/tasks/NON-42 \
  -H "Authorization: Bearer $NIL_AGENT_KEY" \
  -H "Idempotency-Key: $(openssl rand -hex 16)" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "checklistTick": ["Ud2k1x"]}'
```

The checklist item ids come from `GET /tasks/{key}`. Any unique string works as an idempotency key; one per change you mean to make once.

### OpenAI Agents SDK

```python
import os
import requests
from agents import Agent, Runner, function_tool

NIL = "https://nil.example.com/api/agent/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['NIL_AGENT_KEY']}"}


@function_tool
def my_assignments() -> dict:
    """Tasks assigned to me in Nil, most urgent first."""
    return requests.get(f"{NIL}/me/assignments", headers=HEADERS, timeout=30).json()


@function_tool
def get_task(key: str) -> dict:
    """Read a Nil task by key, like NON-12, with its checklist and comments."""
    return requests.get(f"{NIL}/tasks/{key}", headers=HEADERS, timeout=30).json()


@function_tool
def add_comment(key: str, text: str) -> dict:
    """Post a comment on a Nil task."""
    return requests.post(f"{NIL}/tasks/{key}/comments", json={"text": text}, headers=HEADERS, timeout=30).json()


agent = Agent(
    name="Nil helper",
    instructions="You work on tasks in Nil. Read a task before you comment on it.",
    tools=[my_assignments, get_task, add_comment],
)
result = Runner.run_sync(agent, "Look at my most urgent assignment and comment with a plan.")
print(result.final_output)
```

This uses OpenAI's models and needs `OPENAI_API_KEY`. To run it on a local model instead, give the agent a model that points at your server:

```python
from agents import OpenAIChatCompletionsModel, set_tracing_disabled
from openai import AsyncOpenAI

set_tracing_disabled(True)
local = OpenAIChatCompletionsModel(model="<model>", openai_client=AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="unused"))
agent = Agent(name="Nil helper", instructions="…", tools=[my_assignments, get_task, add_comment], model=local)
```

### LangChain

```python
import os
import requests
from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

NIL = "https://nil.example.com/api/agent/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['NIL_AGENT_KEY']}"}


@tool
def search_tasks(query: str) -> dict:
    """Search Nil tasks by words in their title, notes, checklist or comments."""
    return requests.get(f"{NIL}/tasks/search", params={"query": query}, headers=HEADERS, timeout=30).json()


@tool
def claim_task(key: str) -> dict:
    """Take an unassigned Nil task and start it."""
    return requests.post(f"{NIL}/tasks/{key}/claim", headers=HEADERS, timeout=30).json()


model = ChatOpenAI(model="<model>", base_url="http://localhost:11434/v1", api_key="unused")
agent = create_agent(model, [search_tasks, claim_task])
agent.invoke({"messages": [{"role": "user", "content": "Find the task about the launch FAQ and claim it."}]})
```

`create_agent` is LangChain's agent constructor; the older `create_react_agent` from `langgraph.prebuilt` still works but is deprecated. CrewAI and other frameworks work the same way: each tool is one HTTP call.

### Errors and limits

Errors from the REST API always look like this:

```json
{ "error": { "status": 403, "code": "read_only", "message": "This agent is read-only. …" } }
```

| Status | Codes |
| --- | --- |
| 400 | `invalid_arguments` (a field is missing, wrong or unknown), `invalid_request` (the request makes no sense as a whole), `invalid_json`, `invalid_idempotency_key` |
| 401 | `unauthorized`: no key, or a key that isn't valid (wrong, expired, revoked or replaced) |
| 402 | `plan_required` (the workspace's Nil Pro subscription lapsed) |
| 403 | `read_only`, `tool_not_allowed`, `agent_paused`, `origin_not_allowed`, `forbidden` |
| 404 | `not_found`: no such task (or a private one), a task outside the agent's projects, or no such endpoint |
| 409 | `conflict`, `idempotency_conflict` |
| 413 | `too_large` (a body over 256 KB) |
| 429 | `rate_limited`, with `Retry-After`; `too_many_approvals` when 20 requests already wait |
| 500 | `server_error` (not kept under an idempotency key, so a retry gets a real second try) |
| 503 | `agents_disabled` (an admin switched all agents off) |

Each agent has its own rate limit, 60 requests a minute by default. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.

## Receive webhooks

On an external agent's card, open **Webhook**, enter an HTTPS address and pick the events. A server with `AGENT_OUTBOUND=off`, such as hosted Nil, has no route out and doesn't offer webhooks.

| Event | When |
| --- | --- |
| `task.assigned` | Someone assigns the agent a task |
| `task.updated` | A task the agent owns or watches changes (`data.changes` lists the fields) |
| `comment.created` | Someone mentions the agent, or comments on a task it owns or watches |
| `task.due_soon` | A task assigned to it is due within a day (once per due date) |
| `approval.decided` | A person approved or declined one of its requests |

The signing secret is shown once, when the webhook is created or the secret is rotated. Every delivery is a `POST` with a JSON body like this:

```json
{
  "id": "q3Lw9xZ2aBc",
  "type": "comment.created",
  "createdAt": "2026-10-16T09:30:00.000Z",
  "agent": { "id": "dK3m…", "name": "Scout" },
  "data": {
    "task": { "id": "Hw8f…", "key": "NON-42" },
    "actor": { "id": "Lq2p…", "name": "Ana Park", "kind": "person" },
    "comment": { "id": "Zr5t…" },
    "mentioned": true,
    "watching": false
  }
}
```

Payloads hold ids and task keys only. Read the task or comment through the API with the agent's key. `actor.kind` tells you whether a person or another agent did it, so you can avoid two agents answering each other forever.

Headers:

- `Nil-Event`: the event type
- `Nil-Delivery`: the delivery id, the same on retries and redeliveries, so you can ignore duplicates
- `Nil-Timestamp`: Unix seconds when this attempt was signed
- `Nil-Signature`: `t=<timestamp>,v1=<hex>`, where the hex is an HMAC-SHA256 of `<timestamp>.<raw body>` with the secret

Check the signature over the exact bytes you received, and refuse timestamps older than 5 minutes (`AGENT_WEBHOOK_TOLERANCE_SECONDS`).

Node:

```js
import crypto from 'node:crypto';

export function verify(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  const given = Buffer.from(parts.v1 ?? '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
```

Python:

```python
import hashlib
import hmac
import time


def verify(secret: str, header: str, raw_body: bytes, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts.get("t", "0"))
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
```

Answer with any 2xx status within 10 seconds (`AGENT_WEBHOOK_TIMEOUT_SECONDS`), and do slow work afterwards. Anything else, a timeout or a redirect (redirects aren't followed) counts as a failure. Nil tries again with exponential backoff and jitter: the first retry comes within 30 seconds, each wait after that can be up to twice as long, never more than 6 hours, up to 8 attempts in all. After 20 failed attempts in a row, across deliveries, the webhook switches itself off, what was still queued is dropped and admins get a notification; **Turn it back on** on the card starts it again. The card's delivery log shows the last 50 deliveries, every attempt and what your receiver answered; **Redeliver** sends any delivery again, and **Send a test** sends a signed `ping`.

Nil refuses webhook addresses that point to private, loopback, link-local or cloud metadata addresses. It resolves the name once, checks every address and connects to the one it checked, so a DNS answer that changes in between can't redirect it. For an agent on your own network, set `AGENT_ALLOW_LOCAL_ENDPOINTS=true`, which also allows plain `http`. Link-local and metadata addresses stay blocked even then.

## Built-in agents

A built-in agent runs inside Nil when a person assigns it a task or mentions it. The run is queued and starts within seconds. The agent gets the task, its checklist and its latest comments, works through its tools in a bounded loop, then posts a comment with its work. For work assigned to it, it moves the task to In review, unless something waits for approval.

What it posts is the work itself: the plan, the draft text, the answer or the triage. It ticks a checklist item only together with what it produced for that item, such as the text or what its tool calls changed. A tick without that, or with only "done", is refused, and the run log shows the refusal as a Caution step. The items it ticked are listed in its comment, with their results unless the comment already contains them. External agents tick items with `checklistTick` and are responsible for their own work.

The task's timeline shows the run: click it to see each step, every tool call and its result. For a read that brings back tasks, such as `list_tasks`, `search_tasks` or `get_task`, the log keeps which tasks came back and how many, not what they say; the agent itself gets the whole answer. Settings → Agents shows runs and token use per agent, and a cost estimate once the agent has prices.

Runs stop at the step limit, the token limit per run or per day, or the time limit, and say so in their comment. A transient error (rate limits, an overloaded or unreachable model server) puts the run back in the queue with a growing delay, up to 3 retries. The queue is stored in the database, so runs survive restarts; a run cut off by a restart starts again. Only people start runs: an agent's comment or assignment never wakes another built-in agent.

### On Anthropic

1. Set `ANTHROPIC_API_KEY` on the server (the same key built-in AI uses) and `AGENT_MODEL` to the name of the Anthropic model to use. Without `AGENT_MODEL`, agents use `ANTHROPIC_MODEL`; with neither, each agent needs its own model in Settings → Agents.
2. Add an agent with **How it runs: Built in: Anthropic**.
3. Assign it a task or @mention it.

Each request streams and uses adaptive thinking (`AGENT_THINKING`), an effort setting (`AGENT_EFFORT`) and prompt caching. With `AGENT_FALLBACKS=default`, a request the model declines is re-run server-side on a model Anthropic picks; a model or account that doesn't take that setting gets the request again without it, and the server log says so. Set `AGENT_PRICE_INPUT_PER_MTOK` and `AGENT_PRICE_OUTPUT_PER_MTOK` for a cost estimate.

### On a local model

Any server that speaks the OpenAI chat completions API with tool calling works: Ollama, vLLM, LM Studio, or a hosted service such as OpenRouter. Nil talks to it over plain HTTP. Pick a model that supports tool calling.

With Ollama on the same machine:

1. Start Ollama with room for Nil's prompt. The tool list alone is about 3,000 tokens and a run grows with each step, while Ollama's default context without a GPU is 4,096 tokens: `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`. If Ollama runs as a service, set `OLLAMA_CONTEXT_LENGTH` in the service's environment and restart it.
2. In another terminal, fetch a model: `ollama pull <model>`. `ollama list` shows its exact name.
3. Set `AGENT_ALLOW_LOCAL_ENDPOINTS=true` on the Nil server and restart it.
4. Add an agent with **How it runs: Built in: OpenAI-compatible**, endpoint `http://localhost:11434/v1` (in Docker, the host's address or the Ollama container's name), and the model's name as `ollama list` shows it.

Instead of the server-wide setting, a model can carry its own context size: a `Modelfile` with `FROM <model>` and `PARAMETER num_ctx 16384`, then `ollama create <name> -f Modelfile`, and use that name in Nil.

Other servers: LM Studio listens on `http://localhost:1234/v1`; vLLM needs `--enable-auto-tool-choice` and a `--tool-call-parser` for your model; OpenRouter is `https://openrouter.ai/api/v1` with an API key. Nil sends `AGENT_MAX_OUTPUT_TOKENS` as `max_tokens`; a server that refuses it gets the request again without it, and the server log says to lower the setting.

Small models are slower and follow multi-step work less reliably. On four CPU cores without a GPU, a model of about 4 billion parameters at 4-bit takes roughly 1 to 5 minutes per run. Give such agents few tools and clear instructions, and raise `AGENT_RUN_TIMEOUT_SECONDS` if runs stop at the time limit.

With a local model, nothing an agent reads leaves your server. There's no cost estimate unless you enter prices on the agent.

## Untrusted text

Task titles, descriptions and comments are written by people and sometimes pasted from elsewhere. A built-in agent gets them fenced off as content, never as instructions. Its instructions say it can't change its own scope or reveal secrets, and text that reads like an attempt to steer it is flagged in the run log.

None of that is relied on to keep you safe. The server enforces the rules whatever the model does: an agent can only call tools on its allowlist, it has no web, file or network access, it can't see private tasks, its scope and approvals are checked on every call, and anything shaped like a key or secret is scrubbed from its comments. Every tool call is in its audit trail.

## Pausing, deleting and the kill switch

- Pause stops an agent at once: its key is refused, its runs are cancelled and nothing goes to its webhook. Resume starts it fresh.
- Delete revokes its key, removes its webhook, cancels its work, drops pending requests and puts its open tasks back to unassigned. Its name stays in task history and the audit trail.
- The All agents switch at the top of Settings → Agents turns every agent off at once: keys are refused, runs are cancelled and queued webhook deliveries are dropped. Turning it back on starts from a clean slate.

## History and audit

Every change an agent makes appears in the task's history under the agent's name, with "for <person>" when it acted for someone: the person who assigned or mentioned it, or who approved its request. Each agent's **Audit trail** lists every tool call it made, with the outcome, and every change an admin made to the agent.

Run logs, run summaries, the audit trail, approval cards and replies stored for `Idempotency-Key` quote task text, so they follow the workspace's retention settings for comments and history (the shorter of the two). A request still waiting for approval stays until someone decides it. A run's briefing quotes the task's latest comments; when one of them is edited, deleted or erased by the comment retention setting, the briefing shows "(changed or removed since)" in its place. A run's log can quote other tasks the agent read, so guests see how a run went but not its log, and see an approval card's details only when they are asked to decide it.

When a task is made private or erased, what agents kept of its words goes too. Runs still going on it stop. The logs and summaries of runs on it are erased (the runs stay, with their token counts), steps in other runs that changed it lose their details, its approval cards are deleted, the arguments of calls about it leave the audit trail, and replies stored for repeated requests about it no longer quote it. Reads in other runs only ever logged which tasks came back. What an agent wrote in its own words elsewhere, such as its replies in other runs or a comment on another task, stays, as it would if a person had written it.

Webhook secrets and model API keys are sealed with a key kept beside the database (`DATA_DIR/keys/agents-secrets.key`), not in it. Encrypted backups (capsules) carry that key, so a restored server keeps working; erasing the workspace deletes it.

## Configuration

All settings are optional. See `.env.example` for the full list with comments.

| Variable | Default | What it does |
| --- | --- | --- |
| `AGENT_MODEL` | `ANTHROPIC_MODEL` | Model for built-in agents on Anthropic; with neither set, each agent names its own |
| `AGENT_EFFORT` | `high` | Effort for Anthropic runs: `low`, `medium`, `high`, `xhigh`, `max`, or `off` |
| `AGENT_THINKING` | `adaptive` | `off` stops sending the adaptive thinking setting, for older models |
| `AGENT_FALLBACKS` | `off` | `default` asks Anthropic to re-run declined requests on another model |
| `AGENT_MAX_STEPS` | `12` | Model turns per run |
| `AGENT_MAX_TOKENS_PER_RUN` | `300000` | Tokens per run, input and output together |
| `AGENT_MAX_TOKENS_PER_DAY` | `3000000` | Tokens per agent per day |
| `AGENT_MAX_OUTPUT_TOKENS` | `32000` | Longest single model answer, sent as `max_tokens` |
| `AGENT_RUN_TIMEOUT_SECONDS` | `600` | Wall-clock limit per run |
| `AGENT_CONCURRENCY` | `2` | Runs at the same time |
| `AGENT_RETRIES` | `3` | Retries after transient model errors |
| `AGENT_POLL_SECONDS` | `5` | How often queued runs and webhook deliveries are picked up |
| `AGENT_DONE_STATUS` | `in_review` | Where finished assigned work goes, or `none` |
| `AGENT_RATE_LIMIT` | `60` | Requests a minute per agent key |
| `AGENT_IDEMPOTENCY_HOURS` | `24` | How long an `Idempotency-Key` and its answer are kept |
| `AGENT_BULK_LIMIT` | `5` | Tasks an agent may change before approval is needed |
| `AGENT_BULK_WINDOW_MINUTES` | `10` | The window for the bulk limit |
| `AGENT_MAX_PENDING_APPROVALS` | `20` | Requests one agent may have waiting for approval |
| `AGENT_ALLOW_LOCAL_ENDPOINTS` | `false` | Allow private and loopback addresses, and plain `http`, for webhooks and model endpoints |
| `AGENT_OUTBOUND` | on | `off` on a server with no route out: no built-in agents on OpenAI-compatible endpoints and no webhooks. Hosted Nil sets it |
| `AGENT_WEBHOOK_TIMEOUT_SECONDS` | `10` | How long a receiver has to answer one delivery |
| `AGENT_WEBHOOK_MAX_ATTEMPTS` | `8` | Attempts per delivery |
| `AGENT_WEBHOOK_BACKOFF_SECONDS` | `30` | The wait before the first retry; each later wait can be up to twice the last |
| `AGENT_WEBHOOK_DISABLE_AFTER` | `20` | Failed attempts in a row before a webhook switches off |
| `AGENT_WEBHOOK_TOLERANCE_SECONDS` | `300` | The replay window shown to receivers in Settings |
| `AGENT_DUE_SOON_HOURS` | `24` | How far ahead `task.due_soon` looks |
| `AGENT_PRICE_INPUT_PER_MTOK` | unset | Dollars per million input tokens on Anthropic, for the estimate |
| `AGENT_PRICE_OUTPUT_PER_MTOK` | unset | Dollars per million output tokens on Anthropic, for the estimate |
| `JOB_AGENT_DUE_SOON_SECONDS` | `300` | How often the due-soon check runs |
| `JOB_AGENT_PRUNE_SECONDS` | `3600` | How often spent idempotency keys, delivery logs older than 30 days, and run logs, audit entries, decided approvals and stored replies past the retention settings are cleared |
