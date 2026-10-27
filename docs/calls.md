# Calls

Talk to a teammate, or to a few at once, with sound, video and your screen. A call goes straight from browser to browser, encrypted end to end, and each connection is checked against the keys you confirmed with your teammates. Nothing is recorded, ever, and no sound or picture passes through Nil's server.

Calls are for members. Guests don't get them.

## Start a call

Open **Calls** in the sidebar. Everyone on the team is listed with a **Call** button for sound only and a **Video** button. Click one and Nil rings them: in Nil, on every tab they have open, and on their phone if they turned on notifications. The notification says "Incoming call" and nothing else, so a locked phone doesn't show who is calling.

From a [chat](chat.md) conversation, the phone and camera buttons at the top call everyone in it, as long as the conversation is small enough for a call.

To talk with the people on a project, open the project and click the phone button at the top. That starts a call anyone on the team can join, and doesn't ring anyone. While it's going on, the button says **Join call** with the number of people in it, for everyone who opens the project.

Each call holds up to six people unless whoever runs your server set another number. **Add someone** in a call rings one more person.

The first time you start or answer a call in a tab, Nil asks you to unlock your keys, with your wallet or a passkey, as it does for [Docs](encrypted-docs.md#unlock-docs). Every call is checked with them. To get that out of the way, click **Unlock your keys** on the Calls page.

## Answer a call

A ringing call shows at the top of the window with three round buttons: decline, answer with sound only, and answer with video. A call rings for 45 seconds. If nobody answers, it stops and the caller sees "No answer". A call you didn't answer turns into "Missed call" on your phone.

## In a call

The buttons along the bottom, from the left:

| Button | What it does |
|---|---|
| Microphone | Mutes and unmutes you. It's filled in while you can be heard |
| Camera | Turns your camera on and off. Off, the camera stops, and its light goes out |
| Share your screen | Shares a screen, a window or a tab. Phones can't share their screen from a browser |
| Layout | Switches between a grid of everyone and the speaker layout, with one person large |
| Add someone | Rings another teammate into the call |
| Microphone, camera and speaker | Picks your devices, with a preview of your camera and a meter for your microphone |
| Picture in picture | Puts the large video in a small window that stays on top of other apps |
| Minimize | Shrinks the call to a bar, so you can keep working in Nil while you talk |
| Leave | Hangs up |

Someone who is speaking gets a cyan frame. In the speaker layout, whoever spoke last is shown large, unless someone is sharing a screen, which is then shown large instead. Pin a person or a screen with the pin button on its tile to keep it large. With just one other person in the call, they fill the window and you sit in the corner.

Each tile shows the person's name, a crossed-out microphone when they're muted, and bars for how well their connection is doing.

When the other person in a call with one person leaves, the call ends for you too. A project call stays open as long as someone is in it.

## Keyboard shortcuts

| Keys | What they do |
|---|---|
| Ctrl D (⌘ D on a Mac) | Mute or unmute, anywhere in Nil |
| Ctrl E (⌘ E on a Mac) | Camera on or off, anywhere in Nil |
| M | Mute or unmute, on the call screen |
| V | Camera on or off, on the call screen |
| S | Share your screen or stop, on the call screen |
| L | Grid or speaker layout |
| P | Picture in picture |
| Esc | Minimize the call |

## When the network drops

If your network goes, or someone else's does, their tile says **Reconnecting…** and Nil looks for a new path between you, again and again with short pauses, for as long as the call goes on. When the network is back, the call picks up where it was, without anyone redialing. A connection that stays down for longer than about 40 seconds says **Connection lost. Still trying…**.

If it's your connection to Nil that drops and not the call itself, the call carries on and the bar at the top says so. Nobody new can join until Nil is reachable again. A tab that reconnects to Nil within 30 seconds keeps its place in the call.

## Check who you're talking to

Every call is checked with the encryption keys teammates confirm for each other, as for docs and private tasks. Next to each person's name:

- A shield with a tick means you confirmed their key.
- The word **Unverified** means their key is the one Nil has seen for them, but you haven't compared it with them yet. The call works, as a doc would. Click it to see their fingerprint, ask them to read theirs out from Settings, under Sign-in & security, and click **Confirm** if they match. A call is a good moment to do that, as long as you can see or hear it's really them.
- A **Key changed** label means their key differs from the one you confirmed. That's normal after they reset their keys, and it's also what a tampered server would show. The call won't connect until you check it.
- A **No keys** label means they haven't unlocked Nil yet. You can't call them until they do.

If Nil can't verify a connection, it refuses it and says why on the person's tile. Nothing of what you say or show reaches them. Check their key, then click **Try again**.

## How calls stay private

Your browser and theirs set up the call with a short handshake that Nil's server passes along, and then talk to each other directly. The handshake names, among other things, the certificate each browser made for the call. Each browser signs its half with your Ed25519 key, and the other browser checks that signature against the key it holds for you before going any further. Browsers then refuse any connection whose certificate isn't the one that was signed, so the server can't put itself in the middle. [Encryption and trust](encryption.md#calls) has the details.

By default every call goes through a relay (a TURN server) that whoever runs your server set up. Your browser never sends anyone your IP address, and nobody else's reaches you: each side only ever sees the relay's address. The relay carries the call encrypted and can't read or hear it. An admin can allow direct connections, under **Call settings** on the Calls page. They can be quicker, but each person in a call then sees the others' IP addresses, and from them roughly where they are.

The server learns who is in which call, and when they joined. It keeps that in memory only, never on disk or in its logs, and forgets it as soon as the call ends. It never records a call. There's no recording anywhere in Nil.

## Limits

- Calls are a mesh: each browser sends its video to every other person in the call, so six people is a sensible limit. Larger calls would need a different design, described in [Encryption and trust](encryption.md#calls).
- Calls don't work over Tor. Tor carries TCP only, and a call needs UDP and a path between the browsers. With the [Tor setup](tor.md), calls are off.
- Picking a speaker works in browsers that let a page choose where sound goes, which leaves out Safari.
- Phones can't share their screen from a browser.
- On iPhone and iPad, a call in a background tab or with the screen locked may pause after a while. Keep Nil open while you talk.

## Set up calls

For whoever runs the server. Calls need a TURN relay, so no browser has to learn another's IP address. Nil's `docker-compose.yml` comes with one, [coturn](https://github.com/coturn/coturn), under the `calls` profile, hardened: it relays only to public addresses, never to your server or its network, needs a password Nil makes for each person in a call, and has per-person and total limits.

1. Give the relay a host name, such as `turn.example.com`, pointing at your server, and get a TLS certificate for it. The same certbot or Caddy that serves Nil can do that.
2. Make a shared secret with `openssl rand -hex 32` and put it in `.env`, with the rest:

   ```
   TURN_URLS=turns:turn.example.com:5349?transport=tcp,turn:turn.example.com:3478?transport=udp
   TURN_SECRET=<the secret you just made>
   TURN_REALM=turn.example.com
   TURN_EXTERNAL_IP=<your server's public IP address>
   TURN_CERT_DIR=/etc/letsencrypt/live/turn.example.com
   COMPOSE_PROFILES=calls
   ```

   The certificate folder needs `fullchain.pem` and `privkey.pem` that the coturn user can read. Keep the secret out of git.
3. Open these ports in your firewall: 3478 over UDP and TCP, 5349 over TCP, and 49160 to 49999 over UDP for the relayed media.
4. Run `docker compose up -d`. Nil checks the settings at start-up and says in its log if something's missing.

If the relay sits behind NAT, as on most cloud servers, set `TURN_EXTERNAL_IP` to the public address and the private one behind it, as `public/private`, and put the private address in `TURN_ALLOWED_PEER_IP` too, so two people on the same relay can still reach each other through it.

coturn logs the address of everyone who connects, so its log is off by default. Set `TURN_LOG=on` while you look into a problem, and back to `off` after.

The other settings, all optional, are in `.env.example` under Calls: how long a relay password works (`TURN_TTL_SECONDS`, an hour by default), how many people a call may hold (`CALL_MAX_PEERS`), how long a call rings, and the limits on the handshake. `CALLS=off` turns calls off altogether.
