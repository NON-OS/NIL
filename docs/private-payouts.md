# Private payouts

On Ethereum, anyone can look up a wallet and add up everything it has received. Private payouts stop that. Each bounty paid to you lands on a new one-time address that only your keys can open, so nobody watching the chain can tie your earnings to your sign-in wallet or add them up.

## Turn private payouts on

1. Open **Settings → Sign-in & security**.
2. Under **Private payouts**, switch on **Receive bounties at one-time addresses**.
3. If your encryption keys aren't unlocked in this tab yet, sign the unlock message in your wallet. It starts with "Unlock my Nil encryption keys". The very first time, Nil sets up your keys and your wallet signs three times (see [Signing in](signing-in.md#the-signatures-for-encryption-keys)).

Your payout keys come from the same personal keys as your encrypted docs, so any wallet you've added to your keys opens them, and your [recovery kit](signing-in.md#keep-a-recovery-kit) holds them too. They're worked out in your browser and stay in that tab. The server stores only your public "meta-address", which admins and you can see. The section only appears when the server has on-chain features turned on.

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

Click **Move** to send the tokens, and whatever ETH is left after the fee, to an address you type. Your browser signs the transaction with that address's own key, worked out from your payout keys; Nil only passes the signed transaction on to the network. If you type your own sign-in wallet, Nil warns you that this links the payout to you on-chain.

Click **Key** to see the private key of that one-time address, so you can import it into any wallet. Anyone who has this key controls the payout. Click **Hide key** when you're done.

The arrow icon opens the address on a block explorer in a new tab.

## If you start over with new keys

Each payout belongs to the keys that were yours when it was paid. If you lose every wallet that holds your keys, your [recovery kit](signing-in.md#keep-a-recovery-kit) brings those keys back, payouts included. If you start over with new keys instead, Nil can't open payouts sent to the old ones. Starting over also switches private payouts off, so nobody pays you at keys you no longer have: new bounties go to your sign-in wallet until you switch private payouts on again with your new keys. The older payouts stay out of reach unless you copied their keys with **Key** beforehand. If you receive private payouts, keep a recovery kit.

## What stays visible

Private payouts hide which person a payout belongs to. They don't hide the payout itself:

- the payer's address, the token, the amount and the time are public on the blockchain,
- moving the money from the one-time address to a wallet people know links the two,
- admins in your workspace know which payouts are yours,
- a payment receipt names the one-time address. If you put it in a proof of work you share, everyone who sees the proof can link that address to you. Leave it out if the payout should stay unlinked.

## How it works

Private payouts use ERC-5564 stealth addresses on secp256k1. Your browser derives a spending key and a viewing key from your personal seed with HKDF-SHA256, each with its own label, alongside your identity for [anonymous votes](votes.md) and your encryption keys. Learning one of these says nothing about the others or about the seed, and the seed leaves your browser only locked to your wallets or in your recovery kit. Your meta-address holds only the public halves. [Encryption and trust](encryption.md#your-identity) has the details.

For each payout, the payer's browser picks a throwaway key, combines it with your meta-address to get the one-time address and a view tag, and announces the throwaway public key on the ERC-5564 announcer (default `0x55649E01B5Df198D18D95b5cc5051630cfD45564`, the same on every chain where it's deployed). The server never stores the throwaway private key. The derivation matches the ERC-5564 reference SDK on pinned test vectors.

When you move a payout, your browser derives that address's private key from your spending key and the announced public key, signs the transaction itself, and the server only relays it through its Ethereum node. The server checks confirmed private payouts for a late announcement for 7 days. The move offers the tip the server's Ethereum node suggests, but never less than 0.05 gwei: some nodes suggest nothing when blocks have room, and a transaction that tips nothing may sit unmined. The operator can change the ETH top-up with `STEALTH_GAS_TOPUP_WEI`, that least tip with `STEALTH_MIN_TIP_WEI` and the announcer with `STEALTH_ANNOUNCER`.
