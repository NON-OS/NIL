# Check what a server sends

Everything Nil encrypts, it encrypts in your browser, with code the server sent. So the encryption is only as good as that code: a server that sent a changed app could read what you unlock. This page shows how anyone can check that a server sends exactly the app of a Nil release, whether it's your own server, a friend's or the NØNOS foundation's hosted Nil.

Two things make the check possible. Nil's web app builds to the same bytes on any machine, and every release publishes a hash of all of those bytes.

## Check a server

You need Node.js 22, git and about two minutes. Get the source at the release the server runs, build it, and compare:

```bash
git clone https://github.com/NON-OS/NIL-.git nil-check
cd nil-check
git checkout v3.0.0
npm ci
npm run build
npm run verify:server -- https://nil.nonos.software
```

The check prints the release hash of the build you just made. Then it asks the server for every file of the web app, compares each one byte for byte, after undoing any compression the server or its proxy applied, and ends with **All match** or with a list of each file that came back different. It exits with 1 if anything differs, so you can run it from a script or a scheduled job.

If you'd rather not build, compare with the manifest published for the release:

```bash
npm run verify:server -- https://nil.nonos.software --manifest release/web-3.0.0.json
```

That trusts the manifest instead of your own build. Building is the stronger check, because then you rely on nothing but source code you can read.

## The release hash

A release manifest lists every file of the web app with its SHA-256. The release hash is the SHA-256 of the manifest itself, so one number stands for the whole app. Each release publishes it in three places: the manifest in the `release` folder of the source code, the hash in the release notes on GitHub, and the hash on nonos.software.

If the hash you built matches the published one, the published manifest is an honest build of that source. If the server then passes the check, it sends that release.

## What the check covers

- Every file of the web app: the page, scripts, styles, the service worker, the zero-knowledge circuits, icons and the built-in help.
- The addresses people open the app on, such as `/board` and `/votes`, plus a made-up one. The server answers each of them with the app's page, and each has to be exactly that page.
- The Content-Security-Policy. Checked files only matter if the page can't also run scripts from somewhere else, so the policy has to keep scripts to the server's own files, as Nil's does.

## What it can't tell you

- What other people were sent. The check proves what the server sent to the check, at the moment it ran. A server set on harm could send the real app to the check and a changed one to a particular person, or only for an hour. Running the check often, from different networks and over Tor (prefix the command with `torsocks`), makes that harder to hide. Catching it for certain takes a check on every page load inside the browser itself, which Nil doesn't have yet.
- What the server program does. The check covers the web app because that's the part that holds your keys. The server never gets them, and what it can still see is listed in the [privacy model](privacy-model.md).
- What your browser runs from its own storage. A page keeps the code it loaded until you reload it, and the service worker also keeps the app's files so it opens offline. It keeps a file only if its SHA-256 matches the build's own list (`build.json`, which the check above covers too), fetches that list fresh on every page load, and drops what no longer matches, so a file changed once on the way doesn't stay. A server that sends a changed list together with changed files is believed, though: catching that is what the check is for.

## For maintainers: publishing a release

Finish the release, then build it and write its manifest:

```bash
npm ci
npm run build
npm run release:manifest -- --out release/web-$(node -p "require('./package.json').version").json
```

Commit the manifest, tag the release, and put the printed hash in the release notes and on nonos.software. The manifest isn't part of the build, so committing it doesn't change the hash.

The Docker image builds the web app the same way, from the pinned base image and the lockfile. `deploy/release.sh` builds it from the committed tree only (`git archive` of the tagged commit), so a stray file in `client/public` or `docs` on the release machine can't end up in it. To confirm an image carries the release, copy its build out and hash it:

```bash
docker create --name nil-image localhost/nonos/nil:3.0.0
docker cp nil-image:/app/dist image-dist
docker rm nil-image
npm run release:manifest -- --dist image-dist
```
