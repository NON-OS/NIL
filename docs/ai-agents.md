# AI agents in Nil

An agent is an AI teammate. It has a name and an avatar, shows up in the assignee and @mention pickers with an Agent badge, and can be assigned tasks, mentioned in comments and set to watch tasks. It works through the same tools a person's AI assistant uses, inside the projects an admin gives it. It never signs in with a wallet and never takes a paid seat.

There are two kinds:

- **External agents** run somewhere else (Claude Desktop, Claude Code, your own program, an agent framework) and connect to Nil with their own key, over MCP or a plain REST API. They can receive webhooks when something happens.
- **Built-in agents** run inside Nil. When someone assigns one a task or mentions it, Nil runs it on a model the admin picks: Anthropic's Claude, or any OpenAI-compatible endpoint, including a model on your own server.

This page covers what agents can see, how to add one, how to connect each kind, and the settings that control them.

## What agents can and can't see

- An agent sees the team tasks in its projects, plus any task assigned to it. It sees people the way a guest does: admins, and the people on tasks it can see. An agent set to "all projects" sees every team task.
- **Private tasks and docs are never visible to an agent.** They are end-to-end encrypted in people's browsers. No agent, model provider or server can read them, and you can't assign a private task to an agent. Agents are told this, and say so when asked about one.
- A built-in agent on **Anthropic** sends the text of the team tasks it works on (titles, descriptions, checklists and comments) to Anthropic to run the model.
- A built-in agent on a **local model** keeps all of that on your server or network.
- An **external agent** sends what it reads to wherever it runs and to the model provider it uses. Webhooks carry only ids and task keys, never task text.

Settings → Agents shows this disclosure for every agent, to admins and members alike.

## Adding an agent

Admins add agents in **Settings → Agents → Add agent**:

- **Name and avatar colour.** People @mention and assign the agent by its name, so it has to be unique in the workspace.
- **Short description and instructions.** A built-in agent follows the instructions on every run. Task text can't override them.
- **Access.** Read only, or read and write.
- **Projects.** All projects, or the ones you pick.
- **Tools.** The tools it may use. Writing tools need write access.
- **How it runs.** External, built in on Anthropic, or built in on an OpenAI-compatible endpoint.
- **Limits.** For built-in agents: steps and tokens per run, tokens per day, and the status finished work moves to (In review by default). For external agents: requests per minute. Empty fields use the workspace defaults from the server's configuration.

An external agent gets its key when you create it. The key is shown once; Nil keeps only a hash. **Key** on the agent's card makes a new one and revokes the old one at once.

## What needs a person's approval

These requests from an agent don't happen right away. They become an approval card on the task's timeline:

- changing a task outside its projects, or putting work in another project
- deleting or cancelling a task
- giving work to someone else, or taking it away from a person
- changing more tasks than the bulk limit in a short window (5 tasks in 10 minutes by default)

An admin or the person the task belongs to can approve or decline. Approving runs the request as the agent, on the approver's behalf, after checking again that the agent is still allowed to act. A built-in agent then gets a short follow-up run to carry on. External agents get an `approval.decided` webhook, or can check with `get_approval`.

Over the REST API a parked request answers `202` with `{"status": "pending_approval", "approval": {...}}`; over MCP the tool result says so in plain words.

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
| `search_tasks` | `GET /tasks/search` | Full-text search over titles and descriptions |
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

## Connect Claude Desktop or Claude Code over MCP

Use the agent's key (`nonos_agt_…`) and your server's address. In Claude Code:

```sh
claude mcp add --transport http nil-scout https://nil.example.com/mcp \
  --header "Authorization: Bearer nonos_agt_…"
```

In Claude Desktop, or any MCP client that takes a JSON config:

```json
{
  "mcpServers": {
    "nil-scout": {
      "type": "http",
      "url": "https://nil.example.com/mcp",
      "headers": { "Authorization": "Bearer nonos_agt_…" }
    }
  }
}
```

The agent's card in Settings → Agents shows both, filled in with your address. An agent sees only the tools an admin gave it.

## Connect an agent framework over the REST API

The REST API lives at `/api/agent/v1`. Its OpenAPI 3.1 document is at `/api/agent/v1/openapi.json`. It's generated from the same tool list as MCP, and each operation's `operationId` is the tool's name, so frameworks that build tools from OpenAPI get the same names.

Every request needs `Authorization: Bearer <key>`. Writes accept an `Idempotency-Key` header: sending the same request with the same key again returns the first response instead of changing anything twice. Keys are kept for a day.

```sh
curl -H "Authorization: Bearer $NIL_AGENT_KEY" https://nil.example.com/api/agent/v1/me/assignments

curl -X PATCH https://nil.example.com/api/agent/v1/tasks/NON-42 \
  -H "Authorization: Bearer $NIL_AGENT_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "checklistTick": ["Ud2k1x"]}'
```

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

### LangChain or LangGraph

```python
import os
import requests
from langchain_core.tools import tool

NIL = "https://nil.example.com/api/agent/v1"
HEADERS = {"Authorization": f"Bearer {os.environ['NIL_AGENT_KEY']}"}


@tool
def search_tasks(query: str) -> dict:
    """Search Nil tasks by words in their title or description."""
    return requests.get(f"{NIL}/tasks/search", params={"query": query}, headers=HEADERS, timeout=30).json()


@tool
def claim_task(key: str) -> dict:
    """Take an unassigned Nil task and start it."""
    return requests.post(f"{NIL}/tasks/{key}/claim", headers=HEADERS, timeout=30).json()
```

Pass the tools to your agent as usual, for example `create_react_agent(model, [search_tasks, claim_task])` from `langgraph.prebuilt`. CrewAI and other frameworks work the same way: each tool is one HTTP call.

### Errors and limits

Errors always look like this:

```json
{ "error": { "status": 403, "code": "read_only", "message": "This agent is read-only. …" } }
```

| Status | Codes |
| --- | --- |
| 400 | `invalid_arguments`, `invalid_json`, `invalid_idempotency_key` |
| 401 | `unauthorized` (missing, wrong, revoked or rotated key) |
| 402 | `plan_required` (the workspace's Nil Pro subscription lapsed) |
| 403 | `read_only`, `tool_not_allowed`, `agent_paused`, `origin_not_allowed` |
| 404 | `not_found`, `unknown_tool` |
| 409 | `conflict`, `idempotency_conflict` |
| 429 | `rate_limited`, with `Retry-After`; `too_many_approvals` when 20 requests already wait |
| 503 | `agents_disabled` (an admin switched all agents off) |

Each agent has its own rate limit, 60 requests a minute by default. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.

## Receive webhooks

On an external agent's card, open **Webhook**, enter an HTTPS address and pick the events:

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

Answer with any 2xx status within 10 seconds. Anything else, a timeout or a redirect (redirects aren't followed) counts as a failure. Nil tries again with exponential backoff and jitter: the first retry comes within 30 seconds, and each wait after that can be up to twice as long, up to 8 attempts in all. After 20 failed attempts in a row the webhook switches itself off and admins get a notification. The card's delivery log shows every attempt and what your receiver answered; **Redeliver** sends any delivery again, and **Send a test** sends a signed `ping`.

Nil refuses webhook addresses that point to private, loopback, link-local or cloud metadata addresses. It resolves the name once, checks every address and connects to the one it checked, so a DNS answer that changes in between can't redirect it. For an agent on your own network, set `AGENT_ALLOW_LOCAL_ENDPOINTS=true`, which also allows plain `http`. Link-local and metadata addresses stay blocked even then.

## Run the built-in agent on Anthropic

1. Set `ANTHROPIC_API_KEY` on the server (the same key built-in AI uses).
2. Add an agent with **How it runs: Built in: Anthropic**. The model defaults to `AGENT_MODEL` (`claude-opus-5-5`).
3. Assign it a task or @mention it.

The run is queued and starts within seconds. The agent reads the task, its checklist and comments, plans, and works through its tools in a bounded loop. When it's done it posts a comment saying what it did, ticks the checklist items it finished and, for work assigned to it, moves the task to In review. Each request streams, uses adaptive thinking and prompt caching, and falls back server-side to Anthropic's recommended model if the request is declined.

The task's timeline shows the run: click it to see each step, every tool call and its result. Settings → Agents shows runs, token use and a cost estimate per agent.

Runs stop at the step limit, the token limit per run or per day, or the time limit, and say so in their comment. A transient error (rate limits, an overloaded API) puts the run back in the queue with a growing delay, up to 3 retries. The queue is stored in the database, so runs survive restarts; a run cut off by a restart starts again. Only people start runs: an agent's comment or assignment never wakes another built-in agent.

## Run the built-in agent on a local model

Any server that speaks the OpenAI chat completions API with tool calling works: Ollama, vLLM, LM Studio, or a hosted service such as OpenRouter. Nil talks to it over plain HTTP.

With Ollama on the same machine:

```sh
ollama pull llama3.1
ollama serve
```

Then set `AGENT_ALLOW_LOCAL_ENDPOINTS=true` on the Nil server, restart it, and add an agent with:

- How it runs: **Built in: OpenAI-compatible**
- Endpoint: `http://localhost:11434/v1` (in Docker, the host's address or the Ollama container's name)
- Model: `llama3.1`

Other servers: LM Studio listens on `http://localhost:1234/v1`; vLLM needs `--enable-auto-tool-choice` and a `--tool-call-parser` for your model; OpenRouter is `https://openrouter.ai/api/v1` with an API key. Pick a model that supports tool calling. Small models follow multi-step work less reliably; give them few tools and clear instructions.

With a local model, nothing an agent reads leaves your server. The cost estimate is zero unless you enter prices on the agent.

## Untrusted text

Task titles, descriptions and comments are written by people and sometimes pasted from elsewhere. A built-in agent gets them fenced off as content, never as instructions. Its instructions say it can't change its own scope or reveal secrets, and text that reads like an attempt to steer it is flagged in the run log.

None of that is relied on to keep you safe. The server enforces the rules whatever the model does: an agent can only call tools on its allowlist, it has no web, file or network access, it can't see private tasks, its scope and approvals are checked on every call, and anything shaped like a key or secret is scrubbed from its comments. Every tool call is in its audit trail.

## Pausing, deleting and the kill switch

- **Pause** stops an agent at once: its key is refused, its runs are cancelled and nothing goes to its webhook. Resume starts it fresh.
- **Delete** revokes its key, removes its webhook, cancels its work, drops pending requests and puts its open tasks back to unassigned. Its name stays in task history and the audit trail.
- **All agents** at the top of Settings → Agents switches every agent off at once: keys are refused, runs are cancelled and queued webhook deliveries are dropped. Turning it back on starts from a clean slate.

## History and audit

Every change an agent makes appears in the task's history under the agent's name, with "for <person>" when it acted for someone: the person who assigned or mentioned it, or who approved its request. Each agent's **Audit trail** lists every tool call it made, with the outcome, and every change an admin made to the agent.

Run logs and the audit trail quote task text, so they follow the workspace's retention settings for comments and history, and a run's log is erased with its task. A run's log can quote other tasks the agent read, so guests see how a run went but not its log, and see an approval card's details only when they are asked to decide it.

Webhook secrets and model API keys are sealed with a key kept beside the database (`DATA_DIR/keys/agents-secrets.key`), not in it. Encrypted backups (capsules) carry that key, so a restored server keeps working; erasing the workspace deletes it.

## Configuration

All settings are optional. See `.env.example` for the full list with comments.

| Variable | Default | What it does |
| --- | --- | --- |
| `AGENT_MODEL` | `claude-opus-5-5` | Model for built-in agents on Anthropic |
| `AGENT_EFFORT` | `high` | Effort for Anthropic runs: `low`, `medium`, `high`, `xhigh`, `max`, or `off` |
| `AGENT_THINKING` | `adaptive` | `off` stops sending the adaptive thinking setting, for older models |
| `AGENT_MAX_STEPS` | `12` | Model turns per run |
| `AGENT_MAX_TOKENS_PER_RUN` | `300000` | Tokens per run, input and output together |
| `AGENT_MAX_TOKENS_PER_DAY` | `3000000` | Tokens per agent per day |
| `AGENT_MAX_OUTPUT_TOKENS` | `32000` | Longest single model answer |
| `AGENT_RUN_TIMEOUT_SECONDS` | `600` | Wall-clock limit per run |
| `AGENT_CONCURRENCY` | `2` | Runs at the same time |
| `AGENT_RETRIES` | `3` | Retries after transient model errors |
| `AGENT_DONE_STATUS` | `in_review` | Where finished assigned work goes, or `none` |
| `AGENT_RATE_LIMIT` | `60` | Requests a minute per agent key |
| `AGENT_BULK_LIMIT` | `5` | Tasks an agent may change before approval is needed |
| `AGENT_BULK_WINDOW_MINUTES` | `10` | The window for the bulk limit |
| `AGENT_MAX_PENDING_APPROVALS` | `20` | Requests one agent may have waiting for approval |
| `AGENT_ALLOW_LOCAL_ENDPOINTS` | `false` | Allow private and loopback addresses for webhooks and model endpoints |
| `AGENT_WEBHOOK_MAX_ATTEMPTS` | `8` | Attempts per delivery |
| `AGENT_WEBHOOK_DISABLE_AFTER` | `20` | Failed attempts in a row before a webhook switches off |
| `AGENT_PRICE_INPUT_PER_MTOK` | `4` | Dollars per million input tokens, for the estimate |
| `AGENT_PRICE_OUTPUT_PER_MTOK` | `20` | Dollars per million output tokens, for the estimate |
