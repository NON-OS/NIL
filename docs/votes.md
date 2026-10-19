# Votes

Votes let the team decide together. Admins start them, every member is notified, and members vote from the **Votes** page. Guests don't take part.

## Pick the kind of vote

Nil has three kinds of vote. You choose between them with two settings when you start one: **Who counts how much** and **Anonymous ballots**.

| Kind | Settings | Who can see each choice | How ballots count |
|---|---|---|---|
| Signed, ballots public | Anonymous ballots off, Members can see who voted what on | Every member, in the app and the audit file | One per person, or by voting power |
| Signed | Anonymous ballots off, Members can see who voted what off | Admins, through the audit file | One per person, or by voting power |
| Anonymous | Anonymous ballots on, One person, one vote | Nobody | One per person |
| Encrypted weighted (beta) | Anonymous ballots on, Voting power, three trustees | Nobody; only the totals are ever decrypted | By voting power |

Use a signed vote with public ballots for decisions the whole team should be able to check, the way a DAO's votes are open: everyone sees each wallet's choice. Use an anonymous vote when choices must stay secret, even from admins.

## Start a vote

Only admins can start a vote. On **Votes**, click **New vote**, then:

1. Type the **Question**. Add **Details** if the team needs context or links.
2. List the choices under **Options, one per line**. You need between 2 and 8, each worded differently; the box starts with Yes, No and Abstain. The question and each option go on one line.
3. Under **Who counts how much**, choose **One person, one vote** or **Voting power**. Voting power is offered when the server has on-chain features on.
4. Choose how long the vote is open: 1, 3, 7, 14 or 30 days.
5. Turn on **Seal results until it closes** to hide the running totals until the end.
6. Turn on **Anonymous ballots** for an anonymous or encrypted vote.
7. For a signed vote, **Members can see who voted what** starts on. Leave it on to show every member each ballot, or turn it off to keep choices to admins.

Click **Start vote**. Everyone is notified.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), starting a vote needs an active plan. A vote that's already open can always be finished: ballots, closing and decrypting the totals keep working if the plan lapses.

## Signed votes

Click an option and sign the ballot in your wallet. The ballot must be signed by a wallet linked to your account. The text you sign names your choice twice, by its words and by its number among the options (`Option: 2 of 3`), so it can't be misread. You can change your vote while it's open by clicking another option and signing again.

Smart wallets, passkey wallets like Coinbase Smart Wallet among them, can vote too. Their signature doesn't reveal who made it, so Nil asks the chain whether the wallet accepts it, the same way as at sign-in. It asks at one block and notes that block with the ballot.

Unless the results are sealed, everyone sees the running totals.

With **Members can see who voted what** on, every member sees each ballot under **Who voted** on the vote card: the member, their wallet, their choice, their voting power in a weighted vote, and when they voted or last changed their mind. Any member can download the audit file too. Guests never see votes at all. The vote card says above the options that everyone in the workspace can see each choice, and the new vote window says it before you start one.

With it off, the app shows each person only their own choice. The audit file, which only admins can download then, still lists every ballot's wallet address and choice, so admins can see who voted what. The vote card and the new vote window say that instead.

Either way, a sealed vote shows its ballots, in the list and in the audit file, once it closes. Votes started before this setting existed keep the rule they were started under: admins only. Use an anonymous vote when choices must stay secret.

In a vote weighted by voting power, you need some power at the moment the vote opened. Otherwise Nil tells you that you had none then.

## Anonymous votes

If the vote shows **Join anonymous votes**, click it first. This registers your voting key, which comes from the same personal keys as your encrypted docs. If your keys aren't unlocked in this tab, your wallet signs the unlock message first (see [Signing in](signing-in.md#the-signatures-for-encryption-keys)). Only the key's public part, a commitment, goes to the server. Joining and voting are separate clicks on purpose, so your key and your ballot never arrive together. The same key sends [built-in AI requests anonymously](ai-assistants.md#anonymous-requests), and you can also set it up from **Settings → Connect AI**, even in a workspace with the crypto tools off.

Then click an option. Your browser fetches the vote's voter list without your session cookie, so the server can't tell whose request it is, and checks that it's a list the server takes ballots for and the one you were shown while signed in. Then it builds a zero-knowledge proof that the ballot comes from a member who may vote, without saying which member. The proof also names the hour it was made in, by the server's clock. This takes a few seconds while the button says "Proving…". The ballot is sent without your session cookie, after a random pause of two to ten seconds. The server holds it until that hour is over, plus five minutes for ballots made just before the hour turned, then counts it with the others from that hour. So neither the live count nor the database shows when you voted.

Each member has one ballot per vote. You can change it while the vote is open, and each ballot counts once, without weight. A copy of an earlier ballot can't undo a change: a ballot counts only in the hour it was made, and within one hour, an option you changed away from can't be picked again until the next hour starts. Only your browser can tell which ballot is yours; the card says "You voted" and your choice, "only you can tell".

A ballot counts only against the current voter list, or one replaced in the last five minutes when someone joined. When someone loses their seat, older lists stop counting at once. Either way, Nil asks you to vote again.

Who may vote: every member who has set up a voting key when the vote opens, plus anyone who sets one up while it's open. A member who loses access, or becomes a guest, loses their place in votes that are still open. With fewer than three possible voters, the card warns that a ballot is easy to guess.

If you start over with new encryption keys, your voting key changes too. You can't vote in anonymous votes that were already open with your old key. Once they've closed, Nil registers your new key the next time you vote.

## Encrypted weighted votes (beta)

These are anonymous votes where each ballot carries the voter's voting power. To start one, choose **Voting power**, turn on **Anonymous ballots** and pick three **Trustees**. Trustees must be members who have unlocked encrypted docs. Any two of them can decrypt the totals after the vote closes. Two of them together could also open single ballots, so pick people who won't collude.

1. Each trustee opens the vote and clicks **Set up my trustee share**. Nil first asks them to check the other trustees' keys, because the shares will be sealed to those keys (see [Check your teammates' keys](encrypted-docs.md#check-your-teammates-keys)). This step commits to the trustee's share without showing it, signed with the trustee's own signing key. The card says "Waiting for trustees to commit to the vote key" and how many are ready.
2. Once all three have committed, each trustee's browser reveals its share, with a proof that the trustee really holds it, again signed. If the trustee has the vote open with their keys unlocked, Nil does this on its own; otherwise they click **Finish my trustee share**.
3. As soon as the vote key is set up, each trustee's browser checks that every trustee's commitment and dealing are signed with the key it knows for that trustee, that the dealing shown for its own seat is the one it made, and that the shares sent to it match what the others committed to. Again Nil does this on its own when the trustee's keys are unlocked; otherwise they click **Check my key shares**. The vote takes no ballots until all three trustees have checked, and the card says "Trustees are checking their key shares" and how many are done.
4. Members vote as in an anonymous vote. The button says "Encrypting and proving…" while the browser works. Each voter's browser checks every trustee's signatures against the keys it knows for them, works out the vote key from the trustees' commitments and refuses to encrypt to a different key from the server. An encrypted ballot is final: once you've voted, you can't change it. The ballot can't say when it was made, so a copy of an old one couldn't be told apart from a change of mind.
5. After the vote closes, any two trustees click **Decrypt the totals**. Each trustee's browser fetches every ballot, checks its proof, its vote, its key and its voter list, and that no ballot appears twice, then adds them up itself. It decrypts those sums only if they're the ones the server says it counted, and only once per vote: the browser remembers, and refuses other sums for the same vote. Once two trustees have done so, the totals appear.

If a share sent to a trustee doesn't match what its dealer committed to, the trustee's browser files a complaint naming the dealer, signed with the trustee's key, and the card says who complained about whom. The dealer's browser answers on its own when their keys are unlocked, or when they click **Show the disputed share**: it shows that share, signed, and the server and every browser can check it against the dealer's commitments. If it matches, the trustee who complained uses it and checks again, and the vote can open. If it doesn't, the card names the trustee who dealt it, their signed share goes in the audit file as evidence, and an admin starts the vote again. A complaint can only come before the first ballot, since no ballot is taken until all three checks are in. A dealer's browser answers only a complaint signed with the key it knows for the trustee who made it, because each answer puts one share in the open.

Committing first stops a trustee from choosing their share after seeing the others', and the proofs stop one from revealing a share they don't hold. Either trick would let one trustee steer the vote key to one only they know. The signatures stop the server from playing a trustee: it can't commit, deal, complain or answer for one, so it can't set up a vote key it knows. Only the totals are ever decrypted, and each trustee's part comes with a proof that they used their real share. A wrong part is caught, and one trustee alone learns nothing. Voters and trustees check signatures against the keys their browser pinned, so compare fingerprints with the trustees before relying on a vote.

Voting power counts in whole NOX here, so a member with less than 1 NOX of power can't take part.

This feature is in beta. Its circuit hasn't been audited, and its trusted setup was a development ceremony run on one machine. See [Privacy model](privacy-model.md#honest-limits) before relying on it.

## Voting power

In a vote weighted by voting power, each member's power is read from the blockchain when the vote opens, for everyone at the same block:

```
voting power = NOX in linked wallets + NOX staked + Zero-State Passes held × power per pass
```

Tokens moved after that don't change anything, and people who join later have no power in that vote. [NOX, voting power and Nil Pro](nox-and-nil-pro.md#voting-power) explains each part.

If the server's Ethereum node can't answer for every wallet while the power is read, because it's down or won't serve that block, the vote doesn't open and the admin is asked to try again. Nobody is ever counted as holding nothing because of a node problem. A contract that refuses the read itself, such as a paused staking contract, does count as zero for everyone, and the audit file shows it.

## Results and closing

A vote closes by itself at its end time. An admin can close it early with **Close vote**, or delete it with **Delete**. Sealed results appear once it closes.

Admins can download an **Audit file** for any vote, and every member can for a signed vote with public ballots, so anyone can recount it:

- for a signed vote, every ballot with its signed message, signature, wallet, choice and weight, and for a weighted vote the block and the contracts, and with each ballot the voter's wallets as they were read at that block, what each held, and the power they add up to. Members who didn't vote aren't listed. Each ballot says how its signature was checked in `signatureCheck`. A plain wallet's ballot (`ecrecover`) can be recounted from the file alone, by recovering the signer from the signature. A smart wallet's ballot can't: it's checked on-chain, and the file gives the network (`chainId`) and the block it was checked at (`checkedAtBlock`). To recount one, ask the wallet with `isValidSignature(hash, signature)` at that block (`eip1271`, which needs a node that keeps old state), or run the EIP-6492 validator on it (`eip6492`), where hash is the EIP-191 hash of the message,
- for an anonymous vote, the voter group, every group root and every proof, with no names. A ballot's message is the hour it was made in, counted from 1 January 1970, times eight, plus its option's number counting from 0. When you check that no nullifier appears twice, compare them as numbers,
- for an encrypted vote, the census, the roots, the vote's public key, each trustee's account id and signing key, signed commitment, signed commitments with their proofs and the digest of the shares they sealed, any complaint about a share with the dealer's signed answer, the trustees' decryption proofs, and every encrypted ballot with its proof.

A sealed vote's audit file is ready once the vote closes, since its ballots would give away the totals the seal hides.

Each member's power stays in the file for 90 days after a weighted vote closes, or after an encrypted vote's totals are decrypted. After that only the power of members who signed a ballot is kept, since each ballot carries the weight it was counted with, and an encrypted vote keeps the power in its census. The operator sets the number of days with `VOTE_POWER_DAYS`.

## Limits

- In a small team, or with a lopsided result, the totals alone can give choices away.
- Anonymous ballots, and the voter list fetched just before them, carry no cookie, but the server and any proxy still see the IP address and time each one arrives. Use Tor if that matters. If your keys aren't unlocked when you vote, unlocking them sends signed-in requests just before your ballot, so unlock them first if timing matters.
- The server decides who is on a vote's voter list. Your browser checks that the list it proves against is one the server takes ballots for and the one you were shown signed in, but a server that shows everyone the same made-up list isn't caught, and neither is one that picks you out by your IP address for both requests.
- The server decides which ballots the trustees decrypt. Each trustee's browser checks every ballot it gets and adds them up itself, so it never decrypts anything but a sum of valid ballots, but a dishonest server could leave ballots out, down to a single one, and the "totals" would then be that ballot.
- In an encrypted vote, an unusual weight can point to a person if two trustees decrypt single ballots.
- A trustee who never checks their shares, or never answers a complaint, keeps the vote from opening. An admin then starts it again with other trustees.

## How it works

Anonymous ballots are Semaphore (version 4) zero-knowledge proofs, made in your browser from circuit files your own server provides. Your Semaphore identity is derived from your personal seed, like your encryption and private payout keys, so it follows you to every wallet you add to your keys and into your recovery kit. Each vote freezes its members into a Merkle tree, and each ballot proves membership with a nullifier unique to you and that vote, which is how one ballot per member is enforced without names. The ballot's message carries the hour and the option, as hour × 8 + option. Every number in a ballot has to be written the one plain way, below the size of the field it lives in, so one ballot can't be sent twice in two spellings. Anonymous AI requests use the same identity under scopes of their own (`nil/ai-credit/v1`), so their nullifiers can't be matched to your ballots.

Encrypted ballots use NØNOS's own Groth16 circuit (`circuits/ballot.circom`). It proves the voter is in the vote's census with their snapshotted power and encrypts that power into the chosen option with exponential ElGamal on the Baby Jubjub curve. The three trustees run a distributed key generation, so nobody ever holds the whole private key. Each trustee commits to a hash of their coefficient commitments, then reveals them with a Schnorr proof of knowledge for each, which the server and every browser check, and signs both steps with their Ed25519 signing key. The server adds up the encrypted ballots, each trustee's browser adds them up again to check, and any two trustees decrypt only the sums, each with a Chaum-Pedersen proof. [Encryption and trust](encryption.md#encrypted-votes) has the details.
