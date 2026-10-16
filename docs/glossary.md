# Glossary

| Term | Meaning |
|---|---|
| AES-256-GCM | The cipher Nil uses to encrypt docs, private tasks, capsules and recovery kits. It also detects any change to the encrypted text |
| Anonymous vote | A vote where each ballot is a zero-knowledge proof, so nobody can tell who cast it. See [Votes](votes.md) |
| Audit file | A file admins download from a vote so anyone can recount it |
| Bounty | A reward on a task, paid in NOX or another listed token. See [Bounties and payouts](bounties-and-payouts.md) |
| Capsule | One encrypted file with the whole workspace, used for backups and moving servers. See [Backups and moving](backups-and-moving.md) |
| Commitment | A value that stands in for something without revealing it, such as a hashed task title in a receipt or the public part of a voting key |
| Community mode | How a server runs when it doesn't charge for Nil Pro: every tool is unlocked |
| Ed25519 | A signature scheme. The workspace uses it to sign receipts, and each person's browser uses it to sign what they write in docs and private tasks |
| Encrypted weighted vote | An anonymous vote where each ballot carries the voter's power, encrypted, and only the totals are ever decrypted. In beta |
| ERC-20 | The common standard for tokens on Ethereum. NOX and USDC are ERC-20 tokens |
| ERC-5564 | The standard for stealth addresses, which private payouts use |
| Finality | The point after which a block can no longer be undone by a chain reorganisation. Nil counts a payment only once its block is final |
| Fingerprint | A short code that identifies a key, so two people can compare it out loud. A person's key fingerprint has five groups of four characters, such as `5c1e-90ab-3f27-d4e8-a061`, and is under **Encryption keys** in **Settings → Sign-in & security**. The workspace's signing key has a shorter one, such as `dac6-f4fb-e063-2afb`. See [Encryption and trust](encryption.md) |
| Grace period | Days after a Nil Pro plan runs out during which the paid tools keep working. 7 by default |
| Guest | Someone who sees only the projects shared with them and the tasks assigned to them. See [Sharing and guests](sharing-and-guests.md) |
| Invoice | What a workspace pays for Nil Pro: a price in US dollars and an exact amount in USDC or NOX, whose last digits identify the payment. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md#pay-for-nil-pro) |
| Key statement | A message your wallet signs to publish your public encryption and signing keys. It names the site, the workspace, your account and both keys, so teammates' browsers can check the keys are yours |
| MCP | Model Context Protocol, the standard Nil uses to let AI assistants read and change tasks. See [AI assistants](ai-assistants.md) |
| Meta-address | The public part of your private payout keys. Payers use it to work out a new one-time address for each payout |
| My Day | Your private short list of tasks for today, on My work |
| Nil | The private task app for you and your team |
| Nil Pro | The paid plan on servers that charge for it, priced in US dollars and paid in USDC or NOX. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md) |
| NØNOS | The foundation that makes Nil |
| NOX | The ERC-20 token Nil uses for bounties, voting power, the token-holder door and Nil Pro |
| Nullifier | A number in an anonymous ballot that is unique to one member and one vote. It stops double voting without revealing who voted |
| One-time address | A fresh Ethereum address that receives a single private payout |
| Onion service | A way to reach a server through Tor without a domain name or open ports. See [Tor onion service](tor.md) |
| Private task | A task only its creator and assignee can see, with its words encrypted in the browser. See [Private tasks](private-tasks.md) |
| Proof file | A JSON file of signed receipts that someone can check at `/verify`. See [Proof of work](proof-of-work.md) |
| PWA | Progressive web app: a website you can install and open like an app |
| Quick add | Setting a task's due date, priority, labels, project, assignee and repeat by typing them into its title |
| Receipt | A statement signed by the workspace that you finished a task (work receipt) or were paid a bounty (payment receipt) |
| Recovery kit | A small file with your encryption keys locked under a passphrase you choose. It restores your keys if you lose every wallet that holds them. See [Signing in](signing-in.md#keep-a-recovery-kit) |
| Semaphore | The zero-knowledge proof system anonymous votes use |
| Share link | A secret link that shows one project or task, read-only, to anyone who has it |
| SIWE | Sign-In with Ethereum (EIP-4361), the standard Nil uses for wallet sign-in. The messages that unlock and publish encryption keys use the same layout |
| Snapshot | Everyone's voting power, read at one block when a weighted vote opens |
| Token-holder door | A setting that lets anyone holding enough NOX join without an invite |
| Treasury address | An extra address, such as a team's Safe, allowed to pay bounties |
| Trustee | One of the three members who together hold the key of an encrypted weighted vote. Any two can decrypt the totals |
| Unlock | Signing your wallet's unlock message so your browser can open your encryption keys in that tab, for docs, private tasks, private payouts and anonymous votes |
| Unlock message | The message a wallet signs to open your encryption keys. It names the site, the workspace and your account, and its signature never leaves your browser |
| Voting power | NOX held, plus NOX staked, plus Zero-State Passes held times the power per pass |
| X25519 | The key agreement Nil uses to seal a doc's or private task's key for each reader |
| Zero-knowledge proof | A proof that something is true, such as "this ballot comes from a member", that reveals nothing else |
| Zero-State Pass (ZSP) | An NFT. Each one a member holds adds a fixed amount of voting power |
| Zero-state | Nil's controls for keeping less data: auto-erase, erase everything and memory-only mode. See [Zero-state](zero-state.md) |
