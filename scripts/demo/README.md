# Demo workspace

These scripts run a real Nil server on a mock chain, fill it with a believable team workspace, and take screenshots of every main screen. Everything goes through real browsers, with a wallet per person signing for real, so the docs, chat and files are end-to-end encrypted the same way they are for a real team.

The team is Atlas Labs: Ada Okafor, Ben Hart, Cleo Marsh and Dev Rao, shipping version 2.0 of their Atlas wallet app. The workspace is called Atlas, so screens read "Nil / Atlas" and task keys start with ATL. They have four projects, about eighty tasks with twelve weeks of history, goals, votes, tracked time, six docs with a comment thread, three chat channels and shared folders of design files, contracts and a video.

## Running it

Build the web app once with `npm run build`. Then, for everything in one go:

```sh
npm run demo
```

That starts a fresh server, seeds it, writes the screenshots and stops. To work on one step at a time, keep the server running in one terminal and run the others against it:

```sh
npm run demo:server              # add -- --keep to carry on with the last workspace
npm run demo:seed                # add -- --only chat to run one part
npm run demo:shots               # add -- --only board, or -- --out ./shots
```

The seed is safe to run again. Each part looks for what it would make (the projects, a doc with the same title, a channel, a line of conversation, a file) and leaves what is there alone.

Desktop screenshots are 1440 by 900 at 2x, and phone ones are 390 by 844 at 3x, all signed in as Ada.

## Where things go

Nothing is written into the repository. The server data, the four throwaway wallets, each person's sign-in, the generated files and the screenshots all live in the demo folder, which is `nil-demo` in the system temp folder unless `NIL_DEMO_DIR` says otherwise. The wallets are made fresh for each demo folder and hold nothing.

The server listens on port 3996, or `NIL_DEMO_PORT`. When coturn is installed it also runs a relay on port 34780, or `NIL_DEMO_TURN_PORT`, so the Calls screen is set up the way a real server has it.

The files uploaded into Files are made on the first run from small HTML scenes in `assets/`: screenshots for the images, Chromium's print to PDF for the PDFs, a recording for the video, and the web app's own Word export for the offer letter. The six docs are Markdown files in `fixtures/docs/`.
