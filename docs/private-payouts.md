# Private payouts

On Ethereum, anyone can look up a wallet and add up everything it has received. Private payouts stop that. Each bounty paid to you lands on a new one-time address that only your keys can open, so nobody watching the chain can tie your earnings to your sign-in wallet or add them up.

## Turn private payouts on

1. Open **Settings → Sign-in & security**.
2. Under **Private payouts**, switch on **Receive bounties at one-time addresses**.
3. If your encryption keys aren't unlocked in this tab yet, sign the unlock message in your wallet. It starts with "Unlock my Nil encryption keys". The very first time, Nil sets up your keys and your wallet signs three times (see [Signing in](signing-in.md#the-signatures-for-encryption-keys)).

Your payout keys come from the same personal keys as your encrypted docs, so any wallet you've added to your keys opens them, and your [recovery kit](signing-in.md#keep-a-recovery-kit) holds them too. They're worked out in your browser and stay in that tab. The server stores only your public "meta-address", which admins and you can see. The section only appears when the server has on-chain features turned on.

Switch it off to have new bounties paid to your sign-in wallet again. Payouts you already received stay where they are. Admins in this workspace then pay you publicly, even if your wallet has a meta-address in the public registry. Switching off here doesn't take it out of the registry, so payers outside Nil can still find it.

## Publish your meta-address in the registry

The stealth meta-address registry (ERC-6538) is a public contract on Ethereum where a wallet can publish its meta-address. Anyone who knows your wallet address can look it up there and pay you privately, from Nil or from any wallet app that supports stealth addresses.

1. With private payouts on, look under **Publish in the public stealth registry** in the same section. It says whether your meta-address is there.
2. Click **Publish**. Nil explains that your wallet sends a transaction to the registry contract and pays the network fee in ETH.
3. Click **Send from my wallet** and confirm in your wallet. It has to be the wallet your bounties are paid to, the first one linked to your account, because that's the one payers look up.

Once the transaction is mined, the section says **Published**. Nil reads the entry back from the chain through its server instead of assuming it went through. If your wallet has a different meta-address in the registry, for example one from before a key reset or one another app published, the section says so and **Publish again** replaces it.

The registry is public by design. Anyone can see that your wallet published this meta-address, so it links the two. It doesn't link you to your payouts: each payment still goes to a fresh one-time address that only your keys can open and nobody else can tie to you.

Nil lists the payouts made through this server, under **Your private payouts**. It doesn't search the chain for payments someone sends to your meta-address from anywhere else, so those don't appear in Nil.

## What happens when an admin pays you

The admin's pay button says something like "Pay 250 NOX privately to Ana". The admin's browser works out a fresh one-time address that belongs to you, and the admin's wallet sends three things:

- the bounty, to the one-time address,
- an announcement on the standard ERC-5564 announcer contract, so you could find the payout from the blockchain alone,
- a little ETH (0.0003 ETH by default) to the same address, so you can pay the network fee when you move the tokens.

Where the admin's wallet supports it, all three go out as one transaction that either fully happens or doesn't happen at all. Otherwise the wallet asks for each one in turn. If the announcement doesn't go out, the payment shows as "private, unannounced" in the Payments list, and the admin can send it later with **Announce**.

For someone who has no encryption keys in this workspace, the admin's pay button looks up their wallet in the public registry instead. That's how someone who applied on the [public bounty board](public-bounty-board.md) can be paid privately. People who do have keys here are paid privately only at the meta-address they turned on here, never at a registry entry, which could be left over from before a key reset and point at keys they no longer have. If the registry has a valid meta-address for your wallet, the payout works exactly as above, worked out from that meta-address. If it has nothing, or something that isn't a valid meta-address, the bounty goes to your wallet, and the admin sees why it can't be private.

The admin's browser tells Nil the one-time address, but never the throwaway key it was made with. Before counting the payment, the server checks that the money really went to that address. It can't tell a one-time address from any other, so your browser checks that the address is yours before it moves the payout or shows its key.

## Use your payouts

Private payouts appear on the **Bounties** page under **Your private payouts**, each with its one-time address, amount, current balance and status (**Confirming** or **Received**).

Click **Move** to send the tokens, and whatever ETH is left after the fee, to an address you type. Your browser signs the transaction with that address's own key, worked out from your payout keys; Nil only passes the signed transaction on to the network. If you type your own sign-in wallet, Nil warns you that this links the payout to you on-chain.

Click **Key** to see the private key of that one-time address, so you can import it into any wallet. Anyone who has this key controls the payout. Click **Hide key** when you're done.

The arrow icon opens the address on a block explorer in a new tab.

A payout sent to a meta-address that another app published for your wallet is listed here too, but your Nil keys don't open it. Open it with that app: the announcement lets it find the payout.

## If you start over with new keys

Each payout belongs to the keys that were yours when it was paid. If you lose every wallet that holds your keys, your [recovery kit](signing-in.md#keep-a-recovery-kit) brings those keys back, payouts included. If you start over with new keys instead, Nil can't open payouts sent to the old ones. Starting over also switches private payouts off, so nobody pays you at keys you no longer have: new bounties go to your sign-in wallet until you switch private payouts on again with your new keys. The older payouts stay out of reach unless you copied their keys with **Key** beforehand. If you receive private payouts, keep a recovery kit.

## What stays visible

Private payouts hide which person a payout belongs to. They don't hide the payout itself:

- the payer's address, the token, the amount and the time are public on the blockchain,
- moving the money from the one-time address to a wallet people know links the two,
- admins in your workspace know which payouts are yours,
- if you published your meta-address in the registry, anyone can see that it belongs to your wallet,
- when Nil looks up someone's wallet in the registry, its Ethereum node sees which wallet it asked about, shortly before the payout,
- a payout from the team's pool hides the payer too, but the relayer sees the one-time address and the amount, and the team's deposits into the pool are public (see [Privacy model](privacy-model.md#the-team-pool)),
- a payment receipt names the one-time address. If you put it in a proof of work you share, everyone who sees the proof can link that address to you. Leave it out if the payout should stay unlinked.

## Pay from the team's pool

A private payout hides who was paid, but not who paid: the team's wallet still sends it. On a server that has pool payouts on, admins can pay through [Privacy Pools](https://privacypools.com) by 0xbow instead, so the chain doesn't link the team's wallet to the contributor at all. The team puts money into a pool once, in public, and later pays bounties out of it. Each payout leaves the pool through a relayer to a fresh one-time address of the contributor, and nothing on the chain says which deposit paid it.

The contributor needs private payouts turned on in Nil, as above. A meta-address in the public registry isn't enough, because a payout from the pool isn't announced and only Nil can show it to them. They don't need to do anything else: a payout from the pool shows up under **Your private payouts** like any other, and moves the same way.

### Set up the team pool

1. Open the **Bounties** page. Admins see **Team pool** near the bottom.
2. Click **Open the team pool**. If your encryption keys aren't unlocked in this tab yet, your wallet signs the unlock message first.
3. The first time, click **Set up the team pool**. Nil makes a new pool key in your browser and seals it to you.

Other admins get the pool key as soon as an admin who holds it opens the pool, once that admin has confirmed their key (see [Encryption and trust](encryption.md#the-key-directory-and-what-teammates-check)). Until then they see who holds it.

### Deposit

Click **Deposit**, pick the token and type an amount. The dialog shows the pool's smallest deposit and the vetting fee it keeps, both as the entry contract sets them, and what lands in the pool. Your wallet asks you to approve the token and then to deposit; a wallet that can batch does both at once.

The deposit is public, like any deposit: anyone can see that your wallet put that amount into the pool. Deposit well ahead of paying and more than one bounty's worth, so a payout can't be matched to a deposit by its size and timing.

Before a deposit can pay anything, the pool's association set provider has to approve it. On mainnet that's 0xbow, and it usually takes up to a week. Each deposit shows where it stands: **Waiting for review**, **Approved**, **Declined** or **Needs proof of innocence**. The total at the top shows what the pool holds and how much of it is ready to pay privately.

### Pay a bounty from the pool

Next to **Pay** on a finished task under **Ready to pay**, click **From pool**. Your browser works out a new one-time address for the contributor, as for any private payout, and Nil starts the payment and asks the relayer for its price. Before anything happens, the dialog shows:

- what the contributor receives, which is exactly the amount Nil asks for, identifying digits included,
- the relayer's fee, which the team pays on top. Unless the operator turned it off (`PRIVACY_POOLS_EXTRA_GAS`), it includes a little ETH the relayer sends to the one-time address, so the contributor can pay gas when moving the tokens,
- the total that leaves the pool.

Click the pay button to go ahead. Your browser proves the withdrawal (this takes a few seconds to a minute), Nil's server hands it to the relayer, and the relayer sends it. No team wallet signs anything. Nil records the transaction straight away and counts the bounty as paid once its block is final, as with any payment.

A relayer can send the withdrawal and still report a problem: 0xbow's does when the swap that buys the contributor's ETH fails after the withdrawal is out. Nil then looks on-chain for a withdrawal to the payout's one-time address and, if there is one, records it and checks it like any other payment. If the relayer's answer never came, or the withdrawal wasn't mined yet, the deposit stays at **Payout being confirmed** under **Team pool**. **Check for the payout** on it looks again later, for the same payout, so don't pay the bounty another way meanwhile.

When that swap fails, the payout arrives without ETH for gas, and the contributor's payout under **Your private payouts** says so. They send a little ETH to its address before moving it.

A withdrawal spends one deposit at a time, so the payout plus its fee has to fit in one approved deposit. Nil picks the smallest one that covers it.

### Take a deposit back

A deposit the association set declined can't pay bounties privately. **Take back** on it sends what's left of the deposit, in public, to the wallet that made it. This is called a ragequit. Only that wallet can do it, so switch your wallet to it first. You can take back any deposit this way, approved or not.

### Where the pool key and notes live

Everything that lets the team spend its deposits comes from the pool key, twelve words in the same format the Privacy Pools app and SDK use. Each deposit's secrets come from the key, the pool and the deposit's number, and after each payout the secrets of what's left come from the deposit and the number of payouts so far. So the notes Nil keeps are a convenience: the key and the chain alone give them back.

- The pool key is sealed in your browser to each admin's encryption key, the same way doc keys are. The server stores only those sealed copies. Your [recovery kit](signing-in.md#keep-a-recovery-kit) brings your encryption keys back, and with them your copy of the pool key.
- The team's notes (each deposit, what's left of it and which payouts it made) are encrypted in the browser under a key derived from the pool key and stored on the server with a revision number. If two admins change them at once, the second browser merges the two.
- Clicking **Rebuild from the chain** reads every pool event since the team set up its pool, every team's alike, and finds the team's own in your browser. Use it after a payout whose tab closed halfway, or on a new server.
- Clicking **Recovery phrase** shows the twelve words. You don't need them while any admin can still open Nil, but they're a spare that works without Nil: typed into **I have a recovery phrase** on a new server, or into the Privacy Pools app, they reach the same deposits. Anyone with them can spend the pool, so keep them offline.

An admin who was removed or made a member stops getting the pool key from the server. If they opened it while they were an admin, they still know it. Treat that like a shared wallet's key: take every deposit back, then click **Start over with a new key**, which appears once nothing is left in the pool, and set up the pool again.

### Turn pool payouts on

Pool payouts are off unless the operator sets `PRIVACY_POOLS=true`. They work on the chain in `NOX_CHAIN_ID`, Ethereum mainnet or Sepolia, with 0xbow's deployments as defaults: the entry contract (`PRIVACY_POOLS_ENTRYPOINT`), a pool per token (`PRIVACY_POOLS_POOLS`), the association set provider (`PRIVACY_POOLS_ASP_URL`) and, on Sepolia, the relayer (`PRIVACY_POOLS_RELAYER_URL`). Mainnet has no default relayer, so the operator picks one. Any token the server pays bounties in works once 0xbow lists a pool for it, NOX included: Nil asks the entry contract for the token's pool, and refuses a pool that doesn't match the one the operator or the defaults name. `.env.example` lists every setting.

## How it works

Private payouts use ERC-5564 stealth addresses on secp256k1. Your browser derives a spending key and a viewing key from your personal seed with HKDF-SHA256, each with its own label, alongside your identity for [anonymous votes](votes.md) and your encryption keys. Learning one of these says nothing about the others or about the seed, and the seed leaves your browser only locked to your wallets or in your recovery kit. Your meta-address holds only the public halves. [Encryption and trust](encryption.md#your-identity) has the details.

For each payout, the payer's browser picks a throwaway key, combines it with your meta-address to get the one-time address and a view tag, and announces the throwaway public key on the ERC-5564 announcer (default `0x55649E01B5Df198D18D95b5cc5051630cfD45564`, the same on every chain where it's deployed). The throwaway private key never leaves the payer's browser. The server gets the address, the throwaway public key and the view tag, and refuses an address or throwaway key used for an earlier payout, or a wallet someone signs in with. Without the throwaway key, a payout's key says nothing about your spending key, so even someone with the server's data and a key you exported with **Key** can't reach your other payouts. The derivation matches the ERC-5564 reference SDK on pinned test vectors.

When you move a payout, your browser derives that address's private key from your spending key and the announced public key, signs the transaction itself, and the server only relays it through its Ethereum node. The server checks confirmed private payouts for a late announcement for 7 days. The move offers the tip the server's Ethereum node suggests, but never less than 0.05 gwei: some nodes suggest nothing when blocks have room, and a transaction that tips nothing may sit unmined. The operator can change the ETH top-up with `STEALTH_GAS_TOPUP_WEI`, that least tip with `STEALTH_MIN_TIP_WEI` and the announcer with `STEALTH_ANNOUNCER`.

For someone without a meta-address in Nil, the server reads `stealthMetaAddressOf(wallet, 1)` from the ERC-6538 registry (default `0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`, the same on every chain where it's deployed) through its Ethereum node. It accepts only 66 bytes, a compressed spending key and then a compressed viewing key, both points on the curve: the same checks as for a meta-address published in Nil. It keeps the answer for 5 minutes (`STEALTH_REGISTRY_CACHE_SECONDS`), never keeps a failed read, and hands the meta-address to the admin's browser. Because it comes from the node, this relies on a node you trust, as payment checks already do. Publishing sends `registerKeys(1, meta-address)` from your wallet. The operator can name another registry with `STEALTH_REGISTRY`, or set it to `off` to leave the registry out.

A payout from the team's pool is a Privacy Pools withdrawal relayed through the entry contract to the one-time address. Your browser proves it with the protocol's own circuits, which this server hosts, pinned to the SHA-256 hashes the Privacy Pools SDK 1.5.0 publishes (`npm run pools:fetch` fetches them). The proof covers the pool's tree and the association set, which your browser rebuilds from every leaf and checks against the roots on-chain before it proves anything, and it's bound to the relayer's terms: the one-time address and the fee. Nil's server passes it on only after checking those terms itself, and the browser never contacts the relayer, the association set provider or a node directly. The server counts the payment only when the configured pool emitted the withdrawal, the entry contract sent the token to the one-time address and reported the same amount and fee, and the contributor received exactly the amount less the fee. A pool payout is never announced on the ERC-5564 announcer, since the announcement would have to come from a team wallet. Nil keeps its one-time address, throwaway public key and view tag like any private payout's, and that's all the contributor's browser needs to open it, which is why the pool pays only people with private payouts on in Nil.

