# Public bounty board

Admins can open a bounty to people outside the workspace. Listed bounties appear on a public page at `/open` on your server, where anyone can apply by signing with a wallet. Applicants don't need an account or an email address.

## List a bounty

Only admins can list a bounty, and only when the task has a bounty, has no assignee and isn't private.

1. Open the task. Its bounty panel suggests assigning someone or listing it publicly.
2. Switch on **List on the public bounty board**. **View** opens the listing.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), listing needs an active plan.

The listing shows the task key, the title, the first 600 characters of the description, the reward, the due date, when it was listed and how many people have applied. It never shows people, the project, comments or files, so check the description before you list.

A listing comes off the board by itself when the task is assigned, made private, finished, canceled or deleted. You can also switch it off.

To keep a bounty listed but stop new applications, switch off **Take new applications** under the bounty in the task's panel. The board then shows "Not taking applications right now" instead of **Apply**. Switch it back on to open it again.

The same list is published as JSON at `/.well-known/nonos-bounties.json`, so other sites, bots or Nil servers can index it. A bounty that isn't taking applications has `"acceptingApplications": false` there and no `apply` link.

## Apply for a bounty

1. Open the board, from the **Open bounties** link on the sign-in page or the address a team shared.
2. Click **Apply** on a bounty.
3. Fill in **Your name** (a nickname is fine) and **Why you**, for example relevant work and how long it would take.
4. Click **Apply with your wallet** and sign the message. Signing isn't a transaction and costs nothing.

The team sees your name, your pitch and your wallet address. A wallet can apply once for each bounty, and can have up to five applications waiting on one server.

So that nobody can bury a bounty under applications from many wallets, one bounty takes up to 20 new applications an hour and can have up to 100 waiting at once. Only applications still waiting count: once the team declines or deletes some, there's room again. If a bounty is full you see "This bounty has as many applications waiting as it can take" or "This bounty got a lot of applications in the last hour"; try again later. The server's operator can change these limits with `BOUNTY_APPLICATIONS_PER_WALLET`, `BOUNTY_APPLICATIONS_PER_HOUR` and `BOUNTY_MAX_PENDING_APPLICATIONS`.

If the team accepts you, sign in on that server with the same wallet. Until then, signing in shows "Your bounty application is still waiting for the team".

## Review applications

Admins get an Inbox notification when someone applies. Until they've read it, further applications for the same bounty add to that one notification ("Lucia and 4 others applied for your public bounty") instead of each sending a new one. Applications appear under the bounty in the task's panel, with the applicant's name, wallet address and pitch.

Click **Accept** to take someone on. Nil then:

- creates a guest account for their wallet, if they don't have one,
- assigns them the task,
- closes the other applications.

The new guest sees only that task, not its project or anything else in the workspace. When the work is done, pay them like any other bounty; see [Bounties and payouts](bounties-and-payouts.md).

The × next to an application declines it. Declined applications stay on file, so that wallet can't apply for the bounty again. The bin deletes an application instead, with the name, pitch and wallet address. Use it for spam.
