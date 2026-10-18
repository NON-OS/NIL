# AI assistants

There are two separate ways to use AI with Nil. You can connect your own AI assistant, which reads and changes tasks as you. And the person running the server can turn on built-in AI features that call Anthropic's API. Both are optional, and neither is on unless someone sets it up.

## Connect your own assistant

Nil speaks the Model Context Protocol (MCP), a standard way for AI assistants to use outside tools. Once connected, your assistant can read your tasks, create them and post updates for you. It uses a personal key, acts as you and sees exactly what you see.

1. Open **Settings → Connect AI**.
2. Give the key a name you'll recognise, such as the name of the assistant.
3. Choose **Read only** or **Read and write**, and when the key expires: in 30 days, 90 days or a year. Every key expires, after at most a year unless the server allows less (`ACCESS_KEY_MAX_DAYS`).
4. Click **Create key**, sign the "Confirm it's you" message with a wallet linked to your account, and copy the key straight away. It's shown only once. The signature means someone using your signed-in browser can't make a key without your wallet.
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

**Your keys** lists every key with its access, expiry and when it was last used. Click **Revoke** to stop a key working at once. A key also stops working when it expires, when your access to the workspace is removed, and while the token-holder door has you locked out. A sign-in reset revokes all your keys, and **Sign out on all devices** offers to. Keys made before keys had to expire stop once they're `ACCESS_KEY_MAX_DAYS` old.

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
- For a deck: the task titles, names and counts on the slides. If you included your private tasks, their titles are among them.

Encrypted private tasks can't use the task features at all, because the server can't read them. Each person can make up to 12 AI requests a minute. On a server that charges for Nil Pro, built-in AI needs an active plan.
