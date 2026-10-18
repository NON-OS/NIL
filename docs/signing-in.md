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

WalletConnect, where you scan a QR code with your phone, isn't supported. Hardware wallets such as Ledger and Trezor work when you connect them through an extension that supports them. Smart wallets can sign you in but can't hold [encryption keys](#the-signatures-for-encryption-keys) yet.

### No wallet yet

If the device has no wallet, **Sign in with your wallet** explains what a wallet is and how to get one. On a computer it links to a few wallets' official sites and shows a QR code that opens the same page on your phone. On a phone, including an iPhone and Nil installed on the home screen, it offers **Open Nil in your wallet app** for MetaMask, Coinbase Wallet, Rainbow and Trust Wallet. Those links open the wallet app's own browser at the page you were on, so an invite link still works there. Nil loads nothing from these wallets.

## Link a second wallet

If you lose every wallet linked to your account, you can't sign in until an admin resets your sign-in (see below). So link a spare now, ideally a different wallet such as a hardware wallet:

1. Open **Settings → Sign-in & security**.
2. Under **Your wallets**, click **Link another wallet**.
3. In your wallet, switch to the other account or connect the other wallet, then sign.

Any linked wallet can sign you in. You can rename each one by clicking its name, and remove any of them as long as one is left. The first wallet in the list is marked "receives bounties": bounties are paid there unless you turn on [private payouts](private-payouts.md).

If your encryption keys are unlocked in that tab when you link the wallet, Nil adds it to your keys as well, and the new wallet signs one more message twice. Otherwise, see [Add a wallet to your keys](#add-a-wallet-to-your-keys).

## If you lose every wallet

Ask an admin to reset your sign-in. They send you a link that works once and expires after a day (the server can change this). Open it, then link a new wallet:

1. The page greets you by name and says which workspace it's for.
2. Click **Link a new wallet and sign in** and sign with the new wallet.
3. You land on **Settings → Sign-in & security**, with the new wallet named "Wallet from your sign-in reset". Remove the wallets you lost, so nobody else can sign in with them.

It's the same account: your tasks, comments, history, role and proof of work stay as they were. Using the link signs you out on every other device.

Your encryption keys were locked to your old wallets, so the new one can't open them yet. If you added a [passkey](#unlock-with-a-passkey) to your keys, open **Docs**, click **Unlock with a passkey**, then [add the new wallet to your keys](#add-a-wallet-to-your-keys). Otherwise open **Docs** and click **Unlock with your wallet**. Nil says this wallet doesn't unlock your keys yet and shows two ways forward.

- If you have your [recovery kit](#keep-a-recovery-kit), pick the file under **Restore from your recovery kit**, type its passphrase and click **Restore**. Your keys come back as they were, and the new wallet unlocks them from then on.
- If you don't, click **Start over with new keys**. Teammates are asked to confirm your new key, and docs and private tasks sealed to the old keys reach you again only once they have. See [Encrypted docs](encrypted-docs.md#if-unlocking-fails).

Resetting an owner needs a second admin to approve when the workspace has two or more other admins. Every reset is written to the sign-in history admins see under **Settings → Team**.

## Sign out

Click your name at the bottom of the sidebar, then **Sign out**. To end your sessions on every device at once, click **Sign out on all devices** in **Settings → Sign-in & security**.

## The signatures for encryption keys

[Encrypted docs](encrypted-docs.md), [private tasks](private-tasks.md), [private payouts](private-payouts.md) and [anonymous votes](votes.md) all use one set of personal keys that your browser makes the first time you unlock. The server keeps them only locked to your wallets. To open them, your wallet signs a message that starts with "Unlock my Nil encryption keys". It has the same layout as the sign-in message and names your workspace's main address. That signature never leaves your browser.

- The first time, your wallet signs three times: the unlock message twice, then a message that starts with "Publish my Nil encryption keys". The second kind lets teammates check that your public keys are really yours.
- Each wallet you add to your keys later signs its own unlock message twice.
- After that, one signature per browser tab unlocks your keys.

The unlock message is signed twice because the signature is what opens your keys. A wallet that signs the same message differently each time could never open them again, so Nil compares the two and stops with "Your wallet signs the same message differently each time, so it can't hold your keys." That wallet can still sign you in, and another of your wallets can hold your keys. MetaMask, Rabby, Ledger and Trezor work. Smart wallets, including passkey wallets, can't hold or publish encryption keys yet. Once a regular wallet has set up your keys, though, a passkey can unlock them (see [Unlock with a passkey](#unlock-with-a-passkey)).

Your keys are listed under **Encryption keys** in **Settings → Sign-in & security**: your key fingerprint, which teammates compare with theirs, the wallets that unlock your keys, and any passkeys that do. [Encryption and trust](encryption.md) explains the design.

### Add a wallet to your keys

Any wallet you add unlocks the same keys, so losing one wallet doesn't lock you out of your docs.

1. Link the wallet to your account first (see [Link a second wallet](#link-a-second-wallet)).
2. In **Settings → Sign-in & security**, under **Encryption keys**, click **Unlock with your wallet** and sign with a wallet that already holds your keys, or click **Unlock with a passkey**.
3. Switch your wallet to the new account, or connect the other wallet.
4. Click **Add the wallet in your browser** and sign twice.

Removing a wallet from your account also removes it from your keys. If it was the wallet that signed your public keys, teammates can't see your keys until your next unlock, when Nil asks the wallet you're using to sign them again. Your fingerprint doesn't change.

### Keep a recovery kit

A recovery kit is a small file with your keys locked under a passphrase you choose. It brings your keys back if you lose every wallet that holds them, after an admin [resets your sign-in](#if-you-lose-every-wallet). Without one, you'd start over with new keys and lose what was shared with the old ones.

1. Unlock your keys, then go to **Encryption keys** in **Settings → Sign-in & security**.
2. Under **Recovery kit**, type a passphrase of at least 12 characters, twice.
3. Click **Download recovery kit**. You get a file named like `nil-recovery-kit-nonos.example.com.json`.

Keep the file and the passphrase apart, for example the file on a USB stick and the passphrase in a password manager. Anyone with both can open your keys. The kit belongs to one account in one workspace. It still works after the workspace moves to a new address with a capsule. Make a new kit if you ever start over with new keys, because an old kit holds the old ones.

### Unlock with a passkey

A passkey on your phone or computer, or in a password manager, can unlock your encryption keys instead of a wallet signature. It doesn't sign you in: that stays with your wallet.

1. Unlock your keys, then go to **Encryption keys** in **Settings → Sign-in & security**.
2. Under **Passkeys that unlock your keys**, type a name for it, such as "Work laptop", and click **Add a passkey**.
3. Your passkey manager asks three times: once to make the passkey, then twice so Nil can check that it opens your keys.

From then on, **Unlock with a passkey** appears next to **Unlock with your wallet** in **Docs**, on locked private tasks and under **Encryption keys**. The list shows when each passkey was added and last used. Click a name to rename it. **Remove** takes it off your keys, but your passkey manager keeps it until you delete it there.

A passkey is never your only way back to your keys. Nil adds one only while a wallet holds your keys too or after you've downloaded a recovery kit, and it won't let you remove the last wallet that holds your keys while you have passkeys and no kit.

The passkey manager has to support the WebAuthn PRF extension. If yours doesn't, Nil says "Your passkey manager doesn't support unlocking encryption keys" and saves nothing. You can delete the passkey it made in your passkey manager.

A passkey belongs to the web address it was made on. If the workspace moves to a new address, your passkeys stop working there: unlock with your wallet or recovery kit and add new ones. Starting over with new keys removes your passkeys too, since they held the old keys.

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
