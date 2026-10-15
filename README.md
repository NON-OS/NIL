# NONOS

A self-hosted task system for small teams that want to move fast and grow. Projects, a drag-and-drop board, lists, a calendar, goals, insights and a personal My Day, all updating live for everyone on the team.

Your data stays on your server: no analytics, no trackers, no third-party scripts.

## What's inside

- **My work.** Everything assigned to you, grouped into overdue, today, the next 7 days and later, plus a private **My Day** focus list.
- **Board.** Kanban columns from Backlog to Done. Drag cards between columns (mouse, touch or keyboard).
- **All tasks.** A grouped, sortable list with multi-select and bulk edits for status, priority, assignee, project, due date and labels, all undoable.
- **Calendar.** A month view. Drag tasks to reschedule them, or drop them on "No due date".
- **Goals.** Outcomes like "Reach $20k MRR". Track a number, link tasks to the goal, and watch progress add up.
- **Insights.** Tasks finished per week, open work per person, project and goal progress, typical time to done, and recent wins.
- **Projects.** Each project gets its own board and list, a lead, a color and a short key.
- **Tasks.** Status, priority, assignee, due and start dates, repeat schedules, labels, estimates, checklists, Markdown descriptions, file attachments, comments with @mentions, and a full history.
- **Recurring tasks.** Finishing one schedules the next. If you finished late, the next copy skips forward past today.
- **Inbox.** Notifications for assignments, @mentions, comments on tasks you follow, and status changes. Optional desktop notifications.
- **Live collaboration.** Changes appear instantly for everyone. You can see who's online, who's viewing the same task, and who's typing a comment.
- **Quick add that understands you.** For example, `Send investor update friday !high +GE @me every week` sets the due date, priority, project, assignee and repeat schedule in one line.
- **Command palette.** Press `⌘K` / `Ctrl+K` to jump to any task, project or view. Keyboard shortcuts are everywhere (press `?`).
- **Light and dark themes.** It follows your system or your choice, and works on phones.
- **Optional AI assist.** Break a task into steps, draft a description, turn meeting notes into tasks, or write a weekly team brief. It's off unless you add an API key.

## Quick start (local)

Requires **Node.js 22.13 or newer**.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The first person to sign up becomes the workspace owner. Invite teammates from **Settings → Team**.

## Run in production

### With Docker (recommended)

```bash
cp .env.example .env        # optional: edit settings
docker compose up -d --build
```

NONOS is now on port 3000. The database and uploads live in the `nonos-data` volume.

### Without Docker

```bash
npm ci
npm run build
NODE_ENV=production DATA_DIR=/var/lib/nonos npm start
```

### HTTPS

Always serve NONOS over HTTPS. The simplest way is [Caddy](https://caddyserver.com) on the same machine, which gets certificates automatically:

```
tasks.yourcompany.com {
  reverse_proxy localhost:3000
}
```

When running behind any proxy, set `TRUST_PROXY=1` and `APP_URL=https://tasks.yourcompany.com` in `.env`. Secure cookies and correct client IPs depend on it.

### Hosting platforms

Any host that runs a Docker image and gives you a **persistent disk** works: a small VPS (Hetzner, DigitalOcean, Linode), Railway, Render or Fly.io. Mount the disk at `/data` and set `TRUST_PROXY=1`. Run a **single instance**: the database is SQLite and the live updates are in-process.

## Configuration

All settings are environment variables. Every one is optional (see `.env.example`).

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Folder for the SQLite database and uploads |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy |
| `APP_URL` | — | Public URL, added to the allowed origins |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `TRASH_DAYS` | `30` | How long deleted tasks stay recoverable |
| `MAX_UPLOAD_MB` | `25` | Largest attachment |
| `ANTHROPIC_API_KEY` | — | Turns on AI assist |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used by AI assist |

## Backups

Everything lives in `DATA_DIR`: `nonos.db` (plus its `-wal` file) and the `uploads/` folder. For a consistent copy while the server runs:

```bash
sqlite3 /data/nonos.db ".backup '/backups/nonos-$(date +%F).db'"
```

Admins can also download a JSON backup and a CSV of all tasks from **Settings → Data & privacy**.

## Security and privacy

- Passwords are hashed with scrypt, with a 10-character minimum and a check against common passwords.
- Session and invite tokens are random 256-bit and 192-bit values. Only their SHA-256 hashes are stored, so a leaked database can't be used to sign in.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` with the `__Host-` prefix over HTTPS.
- Every write requires a custom header plus a same-origin check, which blocks cross-site request forgery.
- A strict Content Security Policy is sent: no inline scripts and no external hosts. `X-Frame-Options`, `Referrer-Policy: no-referrer`, COOP/CORP and HSTS headers are set too.
- Sign-in, password and AI endpoints are rate-limited. Failed sign-ins take the same time whether or not the email exists.
- Uploads are stored under random names with owner-only file permissions. Only images and PDFs display in the browser, inside a sandbox. Everything else downloads, so an uploaded HTML file can never run.
- Only admins see email addresses.
- Deleted tasks are purged after `TRASH_DAYS`. SQLite `secure_delete` overwrites deleted content. Read notifications are dropped after 90 days.
- Admins can remove a person's access and then permanently delete their account.
- CSV exports neutralise spreadsheet formulas.
- AI assist is opt-in per server. Data goes to Anthropic only when someone clicks an AI button, and only the text that feature needs.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `C` | New task |
| `⌘K` / `Ctrl+K` or `/` | Search and commands |
| `G` then `H` `I` `B` `L` `C` `G` `S` `T` | My work, Inbox, Board, List, Calendar, Goals, Insights, Settings |
| `X` | Select the focused row in a list |
| `⌘ Enter` | Send a comment or save a description |
| `?` | Show all shortcuts |

## Development

```bash
npm run dev         # API on :3000 with auto-restart, web app on :5173 with hot reload
npm test            # API integration tests (auth, privacy, CSRF, uploads, recurrence…)
npm run typecheck   # strict TypeScript for the web app
npm run build       # production bundle into dist/
```

### Project layout

```
server/
  index.js            entry: migrate, start HTTP + WebSocket, schedule purge
  app.js              Express app factory
  config.js           environment settings
  db/                 SQLite connection, migrations, query helper
  auth/               passwords, sessions, cookies, guards, rate limits
  security/           CSRF guard, origin check, security headers
  realtime/           WebSocket hub and presence
  services/           task logic, notifications, activity, mentions
  routes/             one router per resource
  ai/                 optional Claude-powered helpers
  jobs/               retention purge
  mappers/            database rows → API objects
  test/               integration tests
client/src/
  App.tsx, main.tsx   app root and entry
  views/              one file per page
  components/         ui, task, drawer, shell, pickers, overlays, charts, goals, insights, settings
  actions/            API calls grouped by domain
  state/              tiny store with optimistic updates
  realtime/           WebSocket client and event reducer
  lib/                dates, filters, quick-add parser, markdown and more
  types/              one type per file
  styles/             design tokens and base styles
```

Every module has a single export and stays small.

**Stack:** Node 22 (built-in SQLite), Express, ws, React 18, TypeScript, Vite, dnd-kit, lucide icons. Fonts are bundled locally.
