# Votes

Votes let the team decide together. Admins start them, every member is notified, and members vote from the **Votes** page. Guests don't take part.

## Pick the kind of vote

Nil has three kinds of vote. You choose between them with two settings when you start one: **Who counts how much** and **Anonymous ballots**.

| Kind | Settings | Who can see each choice | How ballots count |
|---|---|---|---|
| Signed | Anonymous ballots off | Admins, through the audit file | One per person, or by voting power |
| Anonymous | Anonymous ballots on, One person, one vote | Nobody | One per person |
| Encrypted weighted (beta) | Anonymous ballots on, Voting power, three trustees | Nobody; only the totals are ever decrypted | By voting power |

Use a signed vote when openness is fine and you want each ballot tied to a wallet. Use an anonymous vote when choices must stay secret, even from admins.

## Start a vote

Only admins can start a vote. On **Votes**, click **New vote**, then:

1. Type the **Question**. Add **Details** if the team needs context or links.
2. List the choices under **Options, one per line**. You need between 2 and 8; the box starts with Yes, No and Abstain.
3. Under **Who counts how much**, choose **One person, one vote** or **Voting power**. Voting power is offered when the server has on-chain features on.
4. Choose how long the vote is open: 1, 3, 7, 14 or 30 days.
5. Turn on **Seal results until it closes** to hide the running totals until the end.
6. Turn on **Anonymous ballots** for an anonymous or encrypted vote.

Click **Start vote**. Everyone is notified.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), starting a vote needs an active plan. A vote that's already open can always be finished: ballots, closing and decrypting the totals keep working if the plan lapses.

## Signed votes

Click an option and sign the ballot in your wallet. The ballot must be signed by a wallet linked to your account. You can change your vote while it's open by clicking another option and signing again.

Smart wallets, passkey wallets like Coinbase Smart Wallet among them, can vote too. Their signature doesn't reveal who made it, so Nil asks the chain whether the wallet accepts it, the same way as at sign-in, and notes the block it asked at.

Unless the results are sealed, everyone sees the running totals. The app shows each person only their own choice. The audit file, which admins can download, does list every ballot's wallet address and choice, so admins can see who voted what. Use an anonymous vote when that matters.

In a vote weighted by voting power, you need some power at the moment the vote opened. Otherwise Nil tells you that you had none then.

## Anonymous votes

If the vote shows **Join anonymous votes**, click it first. This registers your voting key, which comes from the same personal keys as your encrypted docs. If your keys aren't unlocked in this tab, your wallet signs the unlock message first (see [Signing in](signing-in.md#the-signatures-for-encryption-keys)). Only the key's public part, a commitment, goes to the server. Joining and voting are separate clicks on purpose, so your key and your ballot never arrive together.

Then click an option. Your browser builds a zero-knowledge proof that the ballot comes from a member who may vote, without saying which member. This takes a few seconds while the button says "Proving…". The ballot is sent without your session cookie, after a short random pause, and the server holds it until the hour it arrived in is over, then counts it with the others from that hour. So neither the live count nor the database shows when you voted.

Each member has one ballot per vote. You can change it while the vote is open, and each ballot counts once, without weight. Only your browser can tell which ballot is yours; the card says "You voted" and your choice, "only you can tell".

Who may vote: every member who has set up a voting key when the vote opens, plus anyone who sets one up while it's open. A member who loses access, or becomes a guest, loses their place in votes that are still open. With fewer than three possible voters, the card warns that a ballot is easy to guess.

If you start over with new encryption keys, your voting key changes too. You can't vote in anonymous votes that were already open with your old key. Once they've closed, Nil registers your new key the next time you vote.

## Encrypted weighted votes (beta)

These are anonymous votes where each ballot carries the voter's voting power. To start one, choose **Voting power**, turn on **Anonymous ballots** and pick three **Trustees**. Trustees must be members who have unlocked encrypted docs. Any two of them can decrypt the totals after the vote closes. Two of them together could also open single ballots, so pick people who won't collude.

1. Each trustee opens the vote and clicks **Set up my trustee share**. Nil first asks them to check the other trustees' keys, because the shares will be sealed to those keys (see [Check your teammates' keys](encrypted-docs.md#check-your-teammates-keys)). This step commits to the trustee's share without showing it. The card says "Waiting for trustees to commit to the vote key" and how many are ready.
2. Once all three have committed, each trustee's browser reveals its share, with a proof that the trustee really holds it. If the trustee has the vote open with their keys unlocked, Nil does this on its own; otherwise they click **Finish my trustee share**.
3. As soon as the vote key is set up, each trustee's browser checks the shares sent to it against what the others committed to. Again Nil does this on its own when the trustee's keys are unlocked; otherwise they click **Check my key shares**. If a share doesn't match, the vote stops taking ballots and the card says "A trustee found a key share that doesn't match what its dealer committed to". An admin then starts the vote again.
4. Members vote as in an anonymous vote. The button says "Encrypting and proving…" while the browser works. Each voter's browser works out the vote key from the trustees' commitments and refuses to encrypt to a different key from the server.
5. After the vote closes, any two trustees click **Decrypt the totals**. Once two have done so, the totals appear.

Committing first stops a trustee from choosing their share after seeing the others', and the proofs stop one from revealing a share they don't hold. Either trick would let one trustee steer the vote key to one only they know. Only the totals are ever decrypted, and each trustee's part comes with a proof that they used their real share. A wrong part is caught, and one trustee alone learns nothing.

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

Admins can download an **Audit file** for any vote, so anyone can recount it:

- for a signed vote, every ballot with its signed message, signature, wallet, choice and weight, and for a weighted vote the block, the contracts and each member's power. Each ballot says how its signature was checked in `signatureCheck`. A plain wallet's ballot (`ecrecover`) can be recounted from the file alone, by recovering the signer from the signature. A smart wallet's ballot can't: it's checked on-chain, and the file gives the network (`chainId`) and the block it was checked at (`checkedAtBlock`). To recount one, ask the wallet with `isValidSignature(hash, signature)` at that block (`eip1271`, which needs a node that keeps old state), or run the EIP-6492 validator on it (`eip6492`), where hash is the EIP-191 hash of the message,
- for an anonymous vote, the voter group, every accepted group root and every proof, with no names,
- for an encrypted vote, the census, the roots, the vote's public key, each trustee's commitments with their proofs, their decryption proofs, and every encrypted ballot with its proof.

## Limits

- In a small team, or with a lopsided result, the totals alone can give choices away.
- Anonymous ballots carry no cookie, but the server and any proxy still see the IP address and time each ballot arrives. Use Tor if that matters.
- In an encrypted vote, an unusual weight can point to a person if two trustees decrypt single ballots.

## How it works

Anonymous ballots are Semaphore (version 4) zero-knowledge proofs, made in your browser from circuit files your own server provides. Your Semaphore identity is derived from your personal seed, like your encryption and private payout keys, so it follows you to every wallet you add to your keys and into your recovery kit. Each vote freezes its members into a Merkle tree, and each ballot proves membership with a nullifier unique to you and that vote, which is how one ballot per member is enforced without names.

Encrypted ballots use NØNOS's own Groth16 circuit (`circuits/ballot.circom`). It proves the voter is in the vote's census with their snapshotted power and encrypts that power into the chosen option with exponential ElGamal on the Baby Jubjub curve. The three trustees run a distributed key generation, so nobody ever holds the whole private key. Each trustee commits to a hash of their coefficient commitments, then reveals them with a Schnorr proof of knowledge for each, which the server and every browser check. The server adds up the encrypted ballots, and any two trustees decrypt only the sums, each with a Chaum-Pedersen proof. [Encryption and trust](encryption.md#encrypted-votes) has the details.
