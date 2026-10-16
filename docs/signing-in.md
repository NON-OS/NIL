# Signing in

Your Ethereum wallet is your Nil account. There is no email, password or phone number. To sign in, your wallet signs a short message written by the server. Signing is free and moves no money.

## Sign in

1. Open your workspace's address.
2. Click **Sign in with your wallet**.
3. Your wallet shows a message that begins with a web address and "wants you to sign in with your Ethereum account". Check that the address is the one in your browser's address bar, then sign.

By default a sign-in lasts 30 days in that browser. Whoever runs the server can change this.

## Wallets that work

Nil works with a wallet that your browser offers to web pages:

- a browser extension, such as MetaMask, Rabby or Coinbase Wallet,
- the wallet built into Brave,
- the browser inside a wallet's phone app.

WalletConnect, where you scan a QR code with your phone, isn't supported. Hardware wallets such as Ledger and Trezor work when you connect them through an extension that supports them.

## Link a second wallet

If you lose every wallet linked to your account, you lose the account. Nobody can add a wallet for you, not even an admin. So link a spare now:

1. Open **Settings → Sign-in & security**.
2. Under **Your wallets**, click **Link another wallet**.
3. In your wallet, switch to the other account or connect the other wallet, then sign.

Any linked wallet can sign you in. You can rename each one by clicking its name, and remove any of them as long as one is left. The first wallet in the list is marked "receives bounties": bounties are paid there unless you turn on [private payouts](private-payouts.md).

## Sign out

Click your name at the bottom of the sidebar, then **Sign out**. To end your sessions on every device at once, click **Sign out on all devices** in **Settings → Sign-in & security**.

## The signatures for encryption keys

Some features ask you to sign a different message. It starts with "NONOS encryption key" or "NONOS private keys", and your browser turns the signature into encryption keys:

- "NONOS encryption key" opens [encrypted docs](encrypted-docs.md) and [private tasks](private-tasks.md).
- "NONOS private keys" opens [private payouts](private-payouts.md) and [anonymous votes](votes.md).

The first time, Nil asks you to sign the same message twice. It checks that your wallet gives the same signature both times, because the keys depend on it. A wallet that signs differently each time can still sign you in, but it can't hold encryption keys. MetaMask, Rabby, Ledger and Trezor all sign the same way every time.

These keys belong to the wallet you first used for them. If you later unlock with another linked wallet, Nil says that wallet "unlocks a different key" and asks you to switch back.

## When sign-in doesn't work

| What you see | What to do |
|---|---|
| No wallet found | This browser has no wallet extension. Install one, or open Nil in your wallet app's browser. |
| No account here uses this wallet | The wallet isn't linked to an account here, or your access was removed. Switch to a linked wallet, or ask an admin for an invite. |
| You declined the request in your wallet | You pressed reject in the wallet. Try again and approve it. |
| Your wallet already has a request waiting | Open your wallet and finish or reject the request that is already there. |
| That wallet request expired | More than 5 minutes passed before you signed. Start again. |
| Your bounty application is still waiting for the team | You applied on the public bounty board and haven't been accepted yet. |
| Your linked wallets hold, followed by an amount | You joined as a NOX holder and your linked wallets now hold less than the workspace's minimum. Top them up, or ask an admin to keep you without the check. |
| This invite can't be used | The link expired or someone already used it. Ask for a new one. |
| Your wallet warns that the request doesn't match the site | The server's configured address differs from the one in your address bar. Don't sign. Tell whoever runs the server. |

## How it works

Nil uses Sign-In with Ethereum (EIP-4361). The server writes the whole message, including a one-time nonce that expires after 5 minutes. Your wallet signs it with `personal_sign`, and the server recovers the signing address (EIP-191 on secp256k1) and compares it with the address the message was written for.

After that the server sets a session cookie. It is `HttpOnly` and `SameSite=Lax`, and over HTTPS it is also `Secure` and carries the `__Host-` prefix. The server stores only a SHA-256 hash of the session token, so a copy of the database can't be used to sign in. Sign-in requests are rate-limited.
