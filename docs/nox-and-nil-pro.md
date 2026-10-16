# NOX, voting power and Nil Pro

NOX is a token on Ethereum (an ERC-20 token). Nil uses it in a few places: bounties can be paid in it, it gives voting power, it can open the workspace to holders, and some servers charge for Nil Pro in it. You can use Nil without holding any NOX.

## The token

By default Nil uses the NOX contract `0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca` on Ethereum mainnet, with 18 decimals. The server reads balances and payments through its Ethereum node. Whoever runs the server can change the token, the network and the node, or turn every on-chain feature off with `NOX_RPC_URL=off`. With on-chain features off, there are no bounty payments, private payouts, token-holder door, weighted votes or paid plan.

## Voting power

Votes can count one per person, or by voting power. Each member's voting power is:

```
NOX in linked wallets + NOX staked + Zero-State Passes held × power per pass
```

NOX in linked wallets is the balance of every wallet linked to the member's account. NOX staked is what those wallets have staked in the official NOX staking contract. A Zero-State Pass (ZSP) is an NFT, and each one held by a member's wallets adds a fixed amount of power.

Admins set the power per pass in **Settings → Team → Voting power**, under **Power per Zero-State Pass, in NOX**. The default is 100,000 NOX per pass.

Power is read when a vote opens, for every member at the same block. Tokens moved after that can't count twice, and people who join later have no power in that vote. Each vote also keeps the power per pass that applied when it opened, so changing the setting never changes a vote that's already running. Encrypted weighted votes count whole NOX only.

The staking contract is read with `getStakeInfo` (default `0xa94d6009790Ba13597A1E1b7cF4e1531eA513613`) and the pass contract with `balanceOf` (default `0x7b575dd8e8b111c52ab1e872924d4efd4df403df`). The operator can change either, or leave one out by setting it to `off`.

## The token-holder door

Admins can let anyone holding a minimum amount of NOX join without an invite. See [People and roles](people-and-roles.md#let-nox-holders-join-without-an-invite).

## Nil Pro

Nil Pro is the paid plan. Whether you ever see it depends on the server.

### Community mode

A server that hasn't set a treasury address (`PLAN_TREASURY`) runs in community mode: every tool is unlocked and nothing is charged. This is the normal way to run Nil yourself, and the AGPL licence lets anyone run it this way. **Settings → Plan** then says **Community mode**.

### On a server that charges

A server that sets a treasury, such as a hosted service, asks each workspace to pay in NOX:

- A free trial runs from the day the workspace was set up, 14 days by default.
- The price is 1000 NOX per 30 days by default.
- After the plan runs out, a grace period (7 days by default) keeps the paid tools working while you renew.
- Nothing renews by itself, and no card or email is ever asked for.

**Settings → Plan** shows where you stand: **Trial**, **Active until** a date, **Grace period** with the day the tools pause, or **Paid tools paused**. It also shows the price, how many people the workspace has against its free seats, and the grace period.

### Pay for Nil Pro

Admins pay from **Settings → Plan**, under **Pay for the plan**:

1. Choose how long to pay for: 30, 90, 180 or 360 days at the default period length.
2. Click **Pay from my wallet** and approve the NOX transfer to the treasury in your wallet.

To pay from a Safe or another wallet, send the NOX to the treasury address shown at the top of the page (hover over it to see it in full), then paste the transaction hash and click **Record payment**. The payment has to come from an admin's wallet or one of the workspace's treasury addresses.

The server checks the transfer on the blockchain and adds one period for each full price paid, up to 24 periods in one payment. Paying during the trial adds to it, so you don't lose the days you were given. Past payments are listed under **Payments**.

### What needs Nil Pro

- new bounties, and listing bounties on the public board,
- starting new votes,
- the token-holder door,
- the built-in AI,
- connecting AI assistants over MCP,
- more people than the free seats, 5 by default. Guests never count.

### What never needs it

Tasks, projects, goals, encrypted docs, time tracking, reminders, share links, reading and exporting are always free. So is paying bounties that were already promised, and finishing votes that are already open: casting ballots, closing them and decrypting the totals.

When the paid tools are paused, the pages that use them show a notice, such as "New bounties need Nil Pro. Everything already here stays readable." Admins see a **Renew plan** button next to it.
