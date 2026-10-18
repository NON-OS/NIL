# AI assistants

There are two separate ways to use AI with Nil. You can connect your own AI assistant, which reads and changes tasks as you. And the person running the server can turn on built-in AI features that call Anthropic's API. Both are optional, and neither is on unless someone sets it up.

## Connect your own assistant

Nil speaks the Model Context Protocol (MCP), a standard way for AI assistants to use outside tools. Once connected, your assistant can read your tasks, create them and post updates for you. It uses a personal key, acts as you and sees exactly what you see.

1. Open **Settings → Connect AI**.
2. Give the key a name you'll recognise, such as the name of the assistant.
3. Choose **Read only** or **Read and write**, and when the key expires: in 30 days, 90 days, a year, or never.
4. Click **Create key** and copy the key straight away. It's shown only once.
5. Under **Set it up**, copy the snippet that fits your assistant: the command for Claude Code, or the JSON for a Claude Code project file or Cursor. Both already contain your server's address and your new key.

Other assistants take the same address and key in their own formats: VS Code, and the Claude app and claude.ai as a custom connector, are in [AI agents](ai-agents.md#connect-an-external-agent-over-mcp); use your personal key where those steps say `nonos_agt_…`. ChatGPT can't send a key, so it can't connect.

Then ask your assistant things like "What's overdue in Nil?", "Create a task for Ana to draft the launch post, due Friday" or "Summarise NON-12".

### What the assistant can do

| Tool | What it does | Needs a read-and-write key |
|---|---|---|
| `whoami` | Your account, your role and the workspace | No |
| `workspace_summary` | Counts of open, in progress, overdue and recently finished tasks, and what's assigned to you | No |
| `list_tasks` | Finds tasks by status, assignee, project or words in the title | No |
| `get_task` | One task in full, by its key, with its latest comments | No |
| `list_projects` | Projects and how many open tasks each has | No |
| `create_task` | Creates a task | Yes |
| `update_task` | Changes a task's status, priority, due date, assignee, title or description | Yes |
| `add_comment` | Comments on a task as you; @mentions notify people as in the app | Yes |

### What it can't do

- Other people's private tasks and all encrypted docs are out of its reach.
- Your own private tasks appear only as "Private task (encrypted)", with their dates and status. It can't read, edit or comment on their words.
- It can't create private tasks, because those are encrypted in your browser.
- It can't do anything you can't do yourself.

Whatever your assistant reads goes to that assistant's provider, under their terms.

### Manage your keys

**Your keys** lists every key with its access, expiry and when it was last used. Click **Revoke** to stop a key working at once. A key also stops working when it expires or when your access to the workspace is removed.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), the connection needs an active plan.

### How the connection works

The endpoint is `/mcp` on your server, using the MCP streamable HTTP transport with plain JSON answers. Each request carries the key as `Authorization: Bearer nonos_pat_…`. Keys are random and stored only as hashes. The endpoint never accepts a browser's session cookie and refuses requests from other web origins, so a web page can't use your signed-in browser to reach it. Each key can make up to 120 requests a minute. Every tool goes through the same visibility rules and checks as the app.

## Built-in AI

When whoever runs the server sets `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (the name of the Anthropic model to use), these features appear:

| Where | Button | What it does |
|---|---|---|
| A task's description | **Draft with AI** or **Rewrite with AI** | Writes a description from the task's details |
| A task's checklist | **Break it down** | Suggests checklist steps |
| Search box | **Turn notes into tasks** | Finds action items in pasted notes. You review them and create the ones you keep |
| Insights | **Write this week's brief** | A short summary of wins, risks and next week's focus |
| A doc | **Draft** | Writes text into the doc from your instruction |
| Status deck | The AI switch | Writes the deck's summary, highlights and speaker notes |

**Settings → Connect AI** says under **Built-in AI** whether it's on.

### What is sent, and when

Text goes to Anthropic only when someone clicks one of these buttons, and only what that feature needs:

- For a task: its title, description, checklist, project name and description, and goal title.
- For notes: the notes you pasted and the names of the people in the workspace, so tasks can be assigned. Nil doesn't store the notes.
- For the weekly brief: the key, title, status, priority, assignee, due date and project of recently finished, overdue, upcoming and stalled team tasks, each person's workload and the goals' progress. Private tasks are never sent.
- For a doc draft: your instruction, and the doc's current text if you leave **Use what's already in this doc as context** on. That text is decrypted in your browser and leaves it for this one request.
- For a deck: the task titles, names and counts on the slides. Private tasks never go, even when you put them on your slides.

Private tasks can't use the task features at all: the server can't read them, and their AI buttons are hidden. Each person can make up to 12 AI requests a minute and 100 a day, whichever way they're sent (`AI_REQUESTS_PER_MINUTE` and `AI_REQUESTS_PER_DAY`). On a server that charges for Nil Pro, built-in AI needs an active plan.

### Anonymous requests

Members can send these requests without the server learning which of them asked. The server learns that some current member of the workspace asked, checks that this member hasn't used up today's requests, and passes the request on. It doesn't learn who it was.

Every AI button says how its request goes: **Anonymous**, or **Signed in**, which means the server knows it's yours. Hover over it for the details; dialogs spell them out.

To send anonymously, a member needs a voting key, the same one [anonymous votes](votes.md#anonymous-votes) use. Open **Settings → Connect AI** and click **Set up anonymous requests**, or join an anonymous vote. Your wallet signs to unlock your keys, and only the public half of the key goes to the server. Do it a while before you use AI, so the key and your first anonymous request don't arrive together. Guests, and members who haven't set up a key, send their requests signed in.

Admins turn anonymous requests on or off for the workspace with the **Anonymous AI requests** switch in the same place. It's on by default. While it's on, a member with a voting key can only send anonymously, so nobody gets two allowances a day. Admins see how many anonymous requests were made each day and nothing else about them.

### What anonymous requests don't hide

The server can't tell which member sent a request, and nothing it stores links a request to a person. Some things can still point to you, and you should know them before relying on this:

- The group you hide in is the workspace's members who have a voting key. In a small team that's only a few people, and the button's note says how many. With two members, the other one knows it was you.
- The server and Anthropic still read every request in full, as they would signed in. If the prompt or the doc text says who you are, or is something only you would ask, the request points to you.
- The time a request arrives can point to you too, for example when you keep the draft and your signed-in save follows a moment later. The browser waits a short random moment before sending, which helps only a little.
- The server and any proxy in front of it see your IP address, the same one your signed-in requests come from. Use [Tor](tor.md) if that matters.
- The server hands out the member list your browser proves against. A dishonest server could hand you a list of its own making and recognise your requests by it. Your browser checks that you're on the list and works out everything else itself, but it can't check who else is.

### How anonymous requests work

They use Semaphore (version 4) zero-knowledge proofs, the same audited circuit and trusted setup as anonymous votes. The idea comes from "ZK API Usage Credits: LLMs and Beyond" by Davide Crapis and Vitalik Buterin (ethresear.ch, February 2026).

1. Each UTC day has a number of slots per member, the daily limit above. Your browser picks one of yours at random that it hasn't used today. To tell which it has used, it fetches today's spent nullifiers, so any member's browser could count how many anonymous requests the team made today, though not whose.
2. It proves, in the browser, that you're in the group of members with a voting key. The proof's scope is that slot of that day in this workspace, under the protocol name `nil/ai-credit/v1`, and its message is a hash of the exact request. So the proof can't carry a different prompt, and the nullifier it produces is unique to you and that slot, unrelated to your nullifiers for other slots, other days or any vote.
3. It sends the proof and the request to `/api/ai-credits/<feature>` without the session cookie, with the usual same-origin and CSRF checks. A request that carries a session cookie is refused.
4. The server checks the proof, the day and the slot, refuses a nullifier it has already seen, checks the plan, and passes the request on. Requests that name a task can only name one every member can see, never a private one.

The server keeps each spent nullifier with its day and nothing else, no time, address or account, and deletes it when the day is over; a count per day stays for admins, for 30 days. When someone joins, the previous few member lists stay good for ten minutes so requests already being proven still go through. When someone leaves or becomes a guest, every list that still has them is refused at once. These are `AI_CREDIT_ROOT_MINUTES`, `AI_CREDIT_ROOTS` and `AI_CREDIT_USAGE_DAYS` in `.env.example`. Since the server can't tell members apart here, the only short-term limit is per IP address, `AI_CREDIT_PER_ADDRESS_PER_MINUTE`.

A request still uses its slot if the AI provider fails on it, because the slot is spent before the request goes out.
