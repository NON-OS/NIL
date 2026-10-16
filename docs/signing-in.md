# Signing in

Your Ethereum wallet is your Nil account. There is no email, password or phone number. To sign in, your wallet signs a short message written by the server. Signing is free and moves no money.

## Sign in

1. Open your workspace's address.
2. Click **Sign in with your wallet**. If your browser has more than one wallet, Nil asks which one to use and remembers your choice on that device. **Use another wallet** under the button changes it.
3. Your wallet shows a message that begins with a web address and "wants you to sign in with your Ethereum account". Check that the address is the one in your browser's address bar, then sign.

By default a sign-in lasts 30 days in that browser. Whoever runs the server can change this.

## Wallets that work

Nil works with a wallet that your browser offers to web pages:

- a browser extension, such as MetaMask, Rabby or Coinbase Wallet,
- the wallet built into Brave,
- the browser inside a wallet's phone app,
- smart wallets, including passkey wallets such as Coinbase Smart Wallet, when your browser offers them.

WalletConnect, where you scan a QR code with your phone, isn't supported. Hardware wallets such as Ledger and Trezor work when you connect them through an extension that supports them.

### No wallet yet

If the device has no wallet, **Sign in with your wallet** explains what a wallet is and how to get one. On a computer it links to a few wallets' official sites and shows a QR code that opens the same page on your phone. On a phone, including an iPhone and Nil installed on the home screen, it offers **Open Nil in your wallet app** for MetaMask, Coinbase Wallet, Rainbow and Trust Wallet. Those links open the wallet app's own browser at the page you were on, so an invite link still works there. Nil loads nothing from these wallets.

## Link a second wallet

If you lose every wallet linked to your account, you can't sign in until an admin resets your sign-in (see below). So link a spare now, ideally a different wallet such as a hardware wallet:

1. Open **Settings → Sign-in & security**.
2. Under **Your wallets**, click **Link another wallet**.
3. In your wallet, switch to the other account or connect the other wallet, then sign.

Any linked wallet can sign you in. You can rename each one by clicking its name, and remove any of them as long as one is left. The first wallet in the list is marked "receives bounties": bounties are paid there unless you turn on [private payouts](private-payouts.md).

## If you lose every wallet

Ask an admin to reset your sign-in. They send you a link that works once and expires after a day (the server can change this). Open it, then link a new wallet:

1. The page greets you by name and says which workspace it's for.
2. Click **Link a new wallet and sign in** and sign with the new wallet.
3. You land on **Settings → Sign-in & security**, with the new wallet named "Wallet from your sign-in reset". Remove the wallets you lost, so nobody else can sign in with them.

It's the same account: your tasks, comments, history, role and proof of work stay as they were. Using the link signs you out on every other device. Encrypted docs and private tasks were sealed to keys from your old wallet, so the new one can't open them by itself.

Resetting an owner needs a second admin to approve when the workspace has two or more other admins. Every reset is written to the sign-in history admins see under **Settings → Team**.

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
| First, a wallet | This device has no wallet. Follow the steps on that screen to get one, or open Nil in your wallet app. |
| That signature doesn't match the wallet. If you use a smart wallet, switch it to... | Your smart wallet signed for a different network than this workspace uses. Switch networks in the wallet and try again. |
| This looks like a smart wallet... isn't connected to Ethereum | The server has on-chain features turned off, so it can't check smart-wallet signatures. Use a regular wallet. |
| This looks like a smart wallet... didn't finish in time | The server couldn't reach its Ethereum node quickly enough. Try again in a minute. |
| This link can't be used | A sign-in reset link expired or was already used. Ask your admin for a new one. |
| No account here uses this wallet | The wallet isn't linked to an account here, or your access was removed. Switch to a linked wallet, or ask an admin for an invite. |
| You declined the request in your wallet | You pressed reject in the wallet. Try again and approve it. |
| Your wallet already has a request waiting | Open your wallet and finish or reject the request that is already there. |
| That wallet request expired | More than 5 minutes passed before you signed. Start again. |
| Your bounty application is still waiting for the team | You applied on the public bounty board and haven't been accepted yet. |
| Your linked wallets hold, followed by an amount | You joined as a NOX holder and your linked wallets now hold less than the workspace's minimum. Top them up, or ask an admin to keep you without the check. |
| This invite can't be used | The link expired or someone already used it. Ask for a new one. |
| Your wallet warns that the request doesn't match the site | The server's configured address differs from the one in your address bar. Don't sign. Tell whoever runs the server. |

## How it works

Nil finds the wallets in your browser through EIP-6963 and falls back to `window.ethereum` for wallets that don't announce themselves. It accepts a wallet's icon only as an embedded image, so showing it never loads anything.

Nil uses Sign-In with Ethereum (EIP-4361). The server writes the whole message, including a one-time nonce that expires after 5 minutes. Your wallet signs it with `personal_sign`, and the server recovers the signing address (EIP-191 on secp256k1) and compares it with the address the message was written for. If that doesn't match, and the server is connected to Ethereum, it asks the configured chain whether the address is a smart-contract wallet that accepts the signature: through `isValidSignature` (EIP-1271) for a deployed wallet, or the EIP-6492 validator in a single `eth_call` for one that isn't deployed yet. That check has its own timeout, `SIGNIN_CHAIN_TIMEOUT_SECONDS`.

After that the server sets a session cookie. It is `HttpOnly` and `SameSite=Lax`, and over HTTPS it is also `Secure` and carries the `__Host-` prefix. The server stores only a SHA-256 hash of the session token, so a copy of the database can't be used to sign in. Sign-in requests are rate-limited.
