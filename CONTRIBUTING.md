# Contributing to Nil

Thanks for helping. A few things keep the codebase pleasant to work in.

## Setup

```bash
npm install
npm run dev        # API on :3000, web app on :5173
npm test           # API integration tests
npm run typecheck  # strict TypeScript
```

Node 22.13 or newer is required (Nil uses the built-in `node:sqlite`).

## House rules

- **One export per file.** Each module does one thing and exports it as its default. Types live one per file in `client/src/types/`.
- **Keep files small.** If a file passes about 200 lines, it probably wants to be two.
- **Comments explain why, not what.** Write them the way you'd explain the code to a teammate, and only where the code can't say it itself.
- **Privacy first.** No analytics, no third-party requests, no new personal data without a reason. Anything that sends data off the server must be opt-in and documented.
- **Validate at the edge.** Every request value goes through `server/lib/check.js` or a dedicated parser.
- **Tests for behaviour.** New server behaviour gets a test in `server/test/`.

## Pull requests

Keep them focused, describe the user-facing change in plain words, and make sure `npm test`, `npm run typecheck` and `npm run build` pass.

By contributing, you agree that your work is licensed under the GNU AGPL v3 or later, the same license as the project.
