# Private payouts

On Ethereum, anyone can look up a wallet and add up everything it has received. Private payouts stop that. Each bounty paid to you lands on a new one-time address that only your wallet's keys can open, so nobody watching the chain can tie your earnings to your sign-in wallet or add them up.

## Turn private payouts on

1. Open **Settings → Sign-in & security**.
2. Under **Private payouts**, switch on **Receive bounties at one-time addresses**.
3. Sign the message in your wallet. It starts with "NONOS private keys". The first time you sign twice, so Nil can check that your wallet always gives the same signature.

Your keys are made from that signature in your browser and stay in that tab. The server stores only your public "meta-address", which admins and you can see. The section only appears when the server has on-chain features turned on.

Switch it off to have new bounties paid to your sign-in wallet again. Payouts you already received stay where they are.

## What happens when an admin pays you

The admin's pay button says something like "Pay 250 NOX privately to Ana". The admin's browser works out a fresh one-time address that belongs to you, and the admin's wallet sends three things:

- the bounty, to the one-time address,
- an announcement on the standard ERC-5564 announcer contract, so you could find the payout from the blockchain alone,
- a little ETH (0.0003 ETH by default) to the same address, so you can pay the network fee when you move the tokens.

Where the admin's wallet supports it, all three go out as one transaction that either fully happens or doesn't happen at all. Otherwise the wallet asks for each one in turn. If the announcement doesn't go out, the payment shows as "private, unannounced" in the Payments list, and the admin can send it later with **Announce**.

Before counting the payment, the server works out the one-time address again from your meta-address and checks that the money really went there.

## Use your payouts

Private payouts appear on the **Bounties** page under **Your private payouts**, each with its one-time address, amount, current balance and status (**Confirming** or **Received**).

Click **Move** to send the tokens, and whatever ETH is left after the fee, to an address you type. Your browser signs the transaction with a key made from your wallet signature; Nil only passes the signed transaction on to the network. If you type your own sign-in wallet, Nil warns you that this links the payout to you on-chain.

Click **Key** to see the private key of that one-time address, so you can import it into any wallet. Anyone who has this key controls the payout. Click **Hide key** when you're done.

The arrow icon opens the address on a block explorer in a new tab.

## What stays visible

Private payouts hide which person a payout belongs to. They don't hide the payout itself:

- the payer's address, the token, the amount and the time are public on the blockchain,
- moving the money from the one-time address to a wallet people know links the two,
- admins in your workspace know which payouts are yours,
- a payment receipt names the one-time address. If you put it in a proof of work you share, everyone who sees the proof can link that address to you. Leave it out if the payout should stay unlinked.

## How it works

Private payouts use ERC-5564 stealth addresses on secp256k1. Your browser stretches one deterministic wallet signature with HKDF-SHA256 into separate secrets: a spending key and a viewing key, plus your identity for [anonymous votes](votes.md). These come from a different signed message than your docs key, so a leak of one set never exposes the other. Your meta-address holds only the public halves.

For each payout, the payer's browser picks a throwaway key, combines it with your meta-address to get the one-time address and a view tag, and announces the throwaway public key on the ERC-5564 announcer (default `0x55649E01B5Df198D18D95b5cc5051630cfD45564`, the same on every chain where it's deployed). The server never stores the throwaway private key. The derivation matches the ERC-5564 reference SDK on pinned test vectors.

When you move a payout, your browser derives that address's private key from your spending key and the announced public key, signs the transaction itself, and the server only relays it through its Ethereum node. The server checks confirmed private payouts for a late announcement for 7 days. The operator can change the ETH top-up with `STEALTH_GAS_TOPUP_WEI` and the announcer with `STEALTH_ANNOUNCER`.
