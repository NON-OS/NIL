# Calls

Talk to a teammate, or to a few at once, with sound, video and your screen. A small call goes straight from browser to browser, and a bigger one through a forwarding server that only ever holds encrypted frames. Either way it's encrypted end to end, and checked against the keys you confirmed with your teammates. Nothing is recorded, ever, and no sound or picture Nil's server could open passes through it.

Calls are for members. Guests don't get them.

## Start a call

Open **Calls** in the sidebar. Calls going on now that you can join are at the top. Below them, under **People**, is everyone on the team, with whoever is online first, each with a phone button for sound only and a camera button for video. Click one and Nil rings them: in Nil, on every tab they have open, and on their phone if they turned on notifications. The notification says "Incoming call" and nothing else, so a locked phone doesn't show who is calling.

To call several people at once, click **New call**, pick them, and click **Call** or **Video call**. Everyone you picked is rung at the same moment.

From a [chat](chat.md) conversation, the phone and camera buttons at the top call everyone in it, as long as the conversation is small enough for a call.

To talk with the people on a project, open the project and click the phone button at the top. That starts a call anyone on the team can join, and doesn't ring anyone. While it's going on, the button says **Join call** with the number of people in it, for everyone who opens the project.

Without a forwarding server (an SFU), a call holds up to six people unless whoever runs your server set another number. With one, a call that grows past four moves onto it without anyone noticing, and holds up to 50. **Add someone** in a call rings one more person.

The first time you start or answer a call in a tab, Nil asks you to unlock your keys, with your wallet or a passkey, as it does for [Docs](encrypted-docs.md#unlock-docs). Every call is checked with them. To get that out of the way, click **Unlock your keys** on the Calls page.

While a call you started rings, the call screen shows who you're calling, large, with your own picture in the corner.

## Recent calls

**Recent** on the Calls page lists the calls you made, took, missed and declined, with who was in them, when, and for how long, and buttons to call back. The server keeps no history of calls, so this list is kept only in this browser, encrypted with your keys like Docs' unsent changes, and shows once your keys are unlocked. Another browser or device has its own list. **Clear recent calls** empties it.

## Answer a call

A ringing call shows a card with three buttons: **Decline**, **Audio** to answer with sound only, and **Video**. On a computer it's at the top right; on a phone it's at the bottom, within reach of your thumb. A call rings for 45 seconds. If nobody answers, it stops and the caller sees "No answer". A call you didn't answer turns into "Missed call" on your phone.

**Don't let them ring me** on a ringing call declines it and stops that person ringing you again. Under **Taking calls** on the Calls page, **Don't ring me** stops every call ringing you, and the list of people you stopped has **Let them ring me** next to each. Someone you stopped can still add you to a call, which then shows on your Calls page without ringing. Nobody can ring the same person more than four times in ten minutes.

## In a call

The buttons along the bottom come in three groups: your microphone and camera on the left, what you can do in the call in the middle, and minimize and **Leave** on the right. Point at a button, or move to it with Tab, to see what it does and its shortcut. On a phone the middle group sits behind the **More** button.

| Button | What it does |
|---|---|
| Microphone | Mutes and unmutes you. It turns white while you're muted |
| Camera | Turns your camera on and off. Off, the camera stops, its light goes out, and the button turns white |
| Share your screen | Shares a screen, a window or a tab. Phones can't share their screen from a browser |
| Layout | Switches between a grid of everyone and the speaker layout, with one person large |
| Add someone | Rings another teammate into the call |
| Microphone, camera and speaker | Picks your devices, with a preview of your camera and a meter for your microphone |
| Picture in picture | Puts the large video in a small window that stays on top of other apps |
| Minimize | Shrinks the call to a bar, so you can keep working in Nil while you talk |
| Leave | Hangs up |

Someone who is speaking gets a cyan frame. In the speaker layout, whoever spoke last is shown large, unless someone is sharing a screen, which is then shown large instead. Pin a person or a screen with the pin button on its tile to keep it large. With just one other person in the call, they fill the window and you sit in the corner.

Each tile shows the person's picture, or, until their picture arrives or while their camera is off, their face over a NØNOS scene that's theirs on every screen and in every call, and a name plate with a crossed-out microphone when they're muted, their key's state, and bars for how well their connection is doing. If anything goes wrong with a connection, the tile says what happened and what you can do about it.

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

If it's your connection to Nil that drops and not the call itself, the call carries on and the bar at the top says so. Nobody new can join until Nil is reachable again. A tab that reconnects to Nil within 30 seconds keeps its place in the call. One that took longer, such as a phone that slept, says so, with a **Rejoin** button that takes you back in if the call is still going.

When your network changes under a call, from Wi-Fi to mobile data for instance, the call finds a new way through the relay, over TCP if UDP stops getting through. The relay's passwords last ten minutes, and the browser fetches fresh ones before they run out, so a long call doesn't drop when they do. A call survives Nil's server restarting too: everyone's place in it is kept on disk until the call ends.

## Check who you're talking to

Every call is checked with the encryption keys teammates confirm for each other, as for docs and private tasks. Next to each person's name:

- A shield with a tick means you confirmed their key.
- The word **Unverified** means their key is the one Nil has seen for them, but you haven't compared it with them yet. The call works, as a doc would. Click it to see their fingerprint, ask them to read theirs out from Settings, under Sign-in & security, and click **Confirm** if they match. A call is a good moment to do that, as long as you can see or hear it's really them.
- A **Key changed** label means their key differs from the one you confirmed. That's normal after they reset their keys, and it's also what a tampered server would show. The call won't connect until you check it.
- A **No keys** label means they haven't unlocked Nil yet. You can't call them until they do.

Until you confirm someone's key, they don't hear or see you. A bar above the call says who, such as "Ada can't see or hear you yet", with **Check their keys** and **Talk anyway**, and their name plate says **Can't hear you**. **Talk anyway** lets them in for this call only; confirming their key lets them in on every call. Meanwhile their screen says they're waiting for you to check their key. That way a key the server slipped in never gets a word or a picture out of you. Someone whose key you confirmed hears and sees you straight away.

If Nil can't verify a connection, it refuses it and says why on the person's tile. Nothing of what you say or show reaches them. Check their key, then click **Try again**.

## How calls stay private

Your browser and theirs set up the call with a short handshake that Nil's server passes along, sealed so the server can't read it, and then talk to each other directly. The handshake names, among other things, the certificate each browser made for the call. Each browser signs its half with your Ed25519 key, and the other browser checks that signature against the key it holds for you before going any further. Browsers then refuse any connection whose certificate isn't the one that was signed, so the server can't put itself in the middle. [Encryption and trust](encryption.md#calls) has the details.

A call of more than four, when your server has an SFU, goes through it instead of from browser to browser. Each browser encrypts every frame of sound and video before it leaves, with a key of its own it hands only to the others in the call, sealed to each one's key and signed. The SFU forwards frames it can't open, to names it gets from Nil that don't say who anyone is or which call it is. Whenever someone joins or leaves, every browser makes a new key, so whoever joins hears nothing from before and whoever left hears nothing after. Each browser also signs a running list of the frames it sends, so not even someone else in the call can pass off sound or video as yours: if frames turn up in your name that you didn't send, everyone else's call stops showing them within a few seconds and says why. Sound goes out at a steady rate and size and video in a few padded sizes, on the SFU and browser to browser alike, so neither the SFU nor the relay can tell from the traffic who is speaking or moving. Frame keys also change every five minutes.

By default every call goes through a relay (a TURN server) that whoever runs your server set up, the SFU included. Your browser never sends anyone your IP address, and nobody else's reaches you: each side only ever sees the relay's address. The relay carries the call encrypted and can't read or hear it. An admin can allow direct connections, under **Call settings** on the Calls page. Even then each device stays on the relay until its owner turns on **Direct connections on this device** under **Taking calls**. They can be quicker, but each person in a call then sees the others' IP addresses, and from them roughly where they are.

Some things can't be hidden by design:

- The server learns who is in which call, and when they joined and left. It keeps that on disk while the call goes on, so a call survives a restart, never in its logs or backups, and deletes it when the call ends, or at the latest after 12 hours.
- Whoever carries push notifications to phones sees when one goes to your phone, so roughly when you're rung, though not by whom.
- The relay sees which IP addresses talk to it, and when, as the SFU does with the relay's own.
- A project call lets in any teammate who opens the project, without asking whoever is in it. Use a call with people for anything else.

Nil never records a call. There's no recording anywhere in Nil.

## Limits

- Without an SFU, calls are a mesh: each browser sends its video to every other person in the call, so six people is a sensible limit.
- A call on the SFU needs a browser that encrypts frames itself: recent Chrome, Edge, Firefox and Safari do. Others get a message saying the call is too big for them.
- Calls don't work over Tor. Tor carries TCP only, and a call needs UDP and a path between the browsers. With the [Tor setup](tor.md), calls are off.
- Picking a speaker works in browsers that let a page choose where sound goes, which leaves out Safari.
- Phones can't share their screen from a browser.
- On iPhone and iPad, Safari stops the microphone and camera when Nil goes to the background or the screen locks, and may pause sound. Nil keeps the screen on while your camera is on, shows the call on the lock screen with buttons to hang up and mute where the browser allows, and when you come back says what stopped, with a **Turn it back on** button. If you were away longer than the call waits for you, **Rejoin** takes you back in. What remains: iOS doesn't let a web page keep talking with the screen locked or ring like a phone call does, so for long calls keep Nil open in front.

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

For calls of more than four, add the SFU, [LiveKit](https://github.com/livekit/livekit) under the same profile, Apache-licensed and run on your own server. It only ever handles encrypted frames, and is reached through the relay like everything else in a call.

1. Give it a host name, such as `sfu.example.com`, and point Caddy at it: `sfu.example.com { reverse_proxy 127.0.0.1:7880 }`. Its API stays on 127.0.0.1.
2. Make a key secret with `openssl rand -hex 32` and add to `.env`:

   ```
   SFU_URL=wss://sfu.example.com
   SFU_API_KEY=nil
   SFU_API_SECRET=<the secret you just made>
   SFU_API_URL=http://127.0.0.1:7880
   ```

3. Open 7881 over TCP and 50000 to 50200 over UDP, and run `docker compose up -d`.

`TURN_EXTERNAL_IP` matters even without NAT: everyone in a call has their relayed address on the relay, coturn refuses to relay to its own addresses unless they're allowed, and the relay allows the ones in `TURN_EXTERNAL_IP` (and `TURN_LISTEN_IP`, when set). Without it, two people on the same relay can't reach each other through it, and the relay says so as it starts. If the relay sits behind NAT, as on many cloud servers, set it to the public address and the private one behind it, as `public/private`.

coturn logs the address of everyone who connects, so its log is off by default. Set `TURN_LOG=on` while you look into a problem, and back to `off` after.

The other settings, all optional, are in `.env.example` under Calls: how long a relay password works (`TURN_TTL_SECONDS`, ten minutes by default; browsers renew them), how many people a call may hold (`CALL_MAX_PEERS`, and with an SFU `CALL_MESH_MAX_PEERS` and `CALL_SFU_MAX_PEERS`), STUN servers for direct connections (`STUN_URLS`), how long a call's record may last (`CALL_RECORD_HOURS`), how often one person may ring another (`CALL_RINGS_PER_PERSON` in `CALL_RING_WINDOW_MINUTES`), how long a call rings, and the limits on the handshake. `CALLS=off` turns calls off altogether.
