# Formal verification

Some of Nil's rules are simple to state and costly to get wrong: one ballot per voter, a vote total that only the trustees can open, a payout address only the payee can spend from, a warning when a server hands back an old version of a private task, invoices that never charge too little or match the wrong payment, and who may change who holds an encrypted chat's key and when a browser may seal in it, with how a browser catches a server that holds chat messages back, replays them, reorders them or shows them as they were. The `formal` folder holds models of these rules written in Lean 4, with machine-checked proofs that the models have the properties below.

The proofs are about models. A model is a small, exact description of what a piece of Nil's code computes, written next to the code it describes. Tests then check that the real JavaScript gives the same answers as the model on the same inputs. This page says what is proven, what is left out, and how the two are tied together.

## What is proven

### Ballot numbers (`formal/Nil/Canonical.lean`)

A ballot's nullifier, Merkle root and commitments arrive as decimal strings. A string is canonical when it has only digits, has no leading zero unless it is "0", and is below the BN254 field order.

- `canonical_eq_iff` and `canonical_string_eq_iff`: two canonical strings denote the same number exactly when they are the same string.
- `round_trip`: every number below the field order prints as a canonical string, and reading that string gives the number back.
- `digits_value`: reading a canonical string and printing the number gives back the same string.
- `dedup_by_string_eq_by_number`: when every accepted nullifier is canonical, counting ballots by distinct string gives the same count as counting by distinct number, so one voter's ballot can't count twice.
- `leading_zero_example`: "07" reads as 7, is a different string from "7", and is not canonical. This is the shape of the bug the audit found.

### Encrypted vote tally (`formal/Nil/Tally.lean`)

The model is exponential ElGamal over any additive group with whole-number multiples, where Enc(m, r) = (r·G, m·G + r·H) and H = x·G. The group laws are stated as fields of a structure. Baby Jubjub's prime-order subgroup, which Nil's encrypted votes use, satisfies them, as does secp256k1.

- `aggregate_enc`: adding encrypted ballots option by option gives an encryption of the sum of the choices under the sum of the randomness.
- `decrypt_enc` and `decrypt_aggregate`: C2 − x·C1 is the total times G.
- `threshold_eq_decrypt` and `threshold_total`: any two of the three trustees, each holding a share of x on a degree-1 polynomial and combining with Lagrange coefficients, get exactly what decrypting with x gives. The proof needs the subgroup order to be prime and the coefficients to be the inverses combineTotals computes, both stated as hypotheses.
- `solve_total`: the bounded discrete log returns the total itself, as long as totals lie between 0 and a bound below the subgroup order.
- `decryption_depends_only_on_total`: what a trustee computes from the verified ballot list depends on the ballots only through their total. Two lists with the same total give the very same result, whatever the individual choices.
- `single_ballot_total`: with a single ballot in the list, the total is that ballot's choice. This is a statement about what is computed, not a proof of secrecy; secrecy rests on the hardness of discrete logarithms, which the model does not cover.

### Private payouts (`formal/Nil/Stealth.lean`)

- `key_controls_address` and `reduced_key_controls_address`: with spending key s, S = s·G and any shared-secret hash h, the one-time key k = (s + h) mod n satisfies k·G = S + h·G, the address the payer paid.
- `address_eq_iff` and `distinct_addresses`: two payouts with different hashes in [0, n) go to different addresses. This needs the generator to have order exactly n, stated as a hypothesis.

### Rollback warnings (`formal/Nil/Rollback.lean`)

The model follows `client/src/lib/isRollback.ts` and `client/src/state/taskVersions.ts` as `taskSeal.open` and `putTasks` call them: warn when the opened pieces disagree or the first is below the newest revision recorded, then record the newest piece.

- `honest_never_warns`: a server that serves every piece of a task at one revision, never going down, never makes Nil warn.
- `older_always_warns`: opening a task at a revision older than one this browser opened or wrote before always warns.
- `mixed_always_warns`: opening a task whose pieces come from different revisions always warns.
- `warns_iff`: the warning is exactly one of those two cases.

### Invoices (`formal/Nil/Invoice.lean` and the files under `formal/Nil/Invoice`)

- `permute_total`, `permute_range`, `permute_inj` and `permute_onto`: the keyed suffix shuffle in `server/billing/permute.js` is a bijection on 1 to 10^digits − 1 for any key and any round function. `halfFor_covers` checks that the Feistel halves the code picks are large enough for every suffix length the server allows.
- `slots_disjoint`: two workspaces in different slots on one treasury are never handed the same suffix.
- `pickSuffix_fresh` and `live_suffixes_distinct`: a new invoice never reuses a suffix of an invoice that is still watched, so the invoices watched at any one time have distinct suffixes.
- `suffix_identifies`: if one transferred amount carries the suffix of two invoices asked on the same grid, the two have the same suffix. Together with the result above, a payment matches at most one watched invoice.
- `ask_ge_minimum` and `ask_price_lt`: the amount asked is at least the price, because it rounds up, and over-charges by less than one grid step.
- `topUp_same_suffix`: the "send the rest" amount after a partial payment ends in the same suffix as the invoice.
- `topUp_completes`: sending that amount in any one token finishes the invoice.
- `owed_le_paid`, `owed_le_sent`, `owed_proportional`, `owed_mono`, `owed_exact` and `owed_full`: an overpaid invoice buys Pro time in proportion to what was paid, rounded down to the millisecond, never more than the money that arrived pays for, and exactly the invoice's periods when it is paid exactly.
- `granted_le_owed`, `granted_le_most`, `granted_mono` and `granted_exact`: one invoice never grants more than `PLAN_MAX_PERIODS` periods however much arrives, the cap only ever takes time away, paying more still never buys less, and an invoice within the cap paid exactly still buys exactly its periods.
- `grant_again`: settling the same payments again adds no time.
- `usdToUnits_covers`, `unitsToUsd_le` and `noxDue_ge`: price conversions round in the treasury's favour, and credit from a payment is never worth more than what arrived.
- `draw_off_balance` and `cancel_refunds`: the credit a new invoice draws comes off the balance exactly, and a cancelled or expired invoice hands back what it drew plus what was paid into it.

### Who holds a chat's key (`formal/Nil/ChatRoster.lean`)

The model follows `client/src/lib/chatRosterRule.ts`, the rule every browser checks each signed member list against, and `server/chat/rosterRule.js`, the same rule the server applies before it takes a list. People are numbers, and `proven` is who has a signed departure that counts.

- `signer_in`: whoever signs a list is on it.
- `first_by_manager`: a conversation's first list is signed by someone it names as a manager, and names no list before it.
- `later`: every list is newer than the one it follows, and keeps the kind of conversation and who it's for.
- `dm_fixed`: a direct message keeps its two people.
- `outsider_refused`: someone not in the conversation can't sign its next list.
- `drop_needs_proof`: someone who doesn't manage the conversation can leave a person out only when that person's departure is proven.
- `no_private_add`: nobody comes into a conversation for some people unless a manager brings them in.
- `managers_kept`: someone who doesn't manage the conversation can't make themselves, or anyone, a manager.
- `unmanaged_everyone`: once every manager has left, everyone still in the conversation manages it, so it's never stuck.
- `member_stays`: along any history of lists, someone stays in unless a manager left them out or their departure was proven.
- `time_increases` and `shape_fixed`: along any history, time only moves forward and the kind of conversation never changes.

### Held-back, replayed and reordered chat messages (`formal/Nil/ChatStreams.lean`)

The model follows `client/src/actions/chat/chatStreams.ts`, sorting included: each sending tab numbers its messages in a timeline, and a browser compares the numbers with the order the server gave.

- `held_back_reported`: a message held back between two that arrived is reported as missing, whatever order the server delivered them in and however many it sent twice, when they were set to disappear alike.
- `replay_reported`: one number under two ids is reported as a replay, in any order.
- `reorder_reported`: a message the server placed after one with a higher number is reported as a reordering.
- `tail_reported`: a tab's signed mark ahead of every number delivered from it is reported as messages held back at the end.
- `honest_silent`: a server that delivers a tab's messages 1 to k in order, each once, raises nothing, nor does the tab's mark.

### Chat shown as it was (`formal/Nil/ChatHistory.lean`)

The model follows `client/src/state/editHistory.ts`, as `openMessage` uses it, and `client/src/lib/lateUnderOldKey.ts`.

- `deleted_stays` and `record_deleted_absorbs`: once a browser saw a message deleted, it never shows it again, and nothing recorded later undoes that.
- `older_refused`: after a version of a message is opened, any older one is refused.
- `honest_never_stale`: a server that shows each message's versions in the order they were made never trips it.
- `late_caught`: a message under an older key that the server placed after an unedited one under a newer key is caught, wherever the two are.
- `honest_none_late`: messages a server took in turn are never flagged.

Writing this model found a bug: the browser's record skipped a deletion of a message it had already seen edited, so such a message could come back. The record now always keeps a deletion, and the differential test fails on the old code.

### When a browser seals in a chat (`formal/Nil/ChatSeal.lean`)

The model follows `client/src/lib/sealBlockers.ts`, which `sealGate` applies before every message, edit, reaction, name and mark.

- `sealed_only_to_confirmed`: whatever is sealed can be opened only by people whose key this browser confirmed.
- `none_out`: nothing is sealed while someone the server has as out still holds the key.
- `current_and_signed`: nothing is sealed under an epoch older than one the browser checked, or another history, or settings the server changed.
- `seals_when_safe`: when all of that holds, nothing stands in the way.

## What is not proven

The proofs say nothing about code they don't model. In particular:

- The JavaScript itself. The models are written to match it, and the tests below check that they agree on many inputs, but no proof covers the JavaScript.
- The circuits. That a Semaphore or ballot proof only verifies for a correct statement is the job of the circuits and the trusted setup.
- The curve and hash implementations. Point addition, scalar multiplication, keccak and HMAC come from libraries. The models only assume the group laws, and treat the hash and the HMAC round function as arbitrary functions.
- Secrecy. Nothing here shows that a ciphertext, a nullifier or a stealth address hides anything. That rests on cryptographic hardness assumptions, which are outside these models.
- Side channels, timing, the network, the database and the browser's storage.
- For chat: the signatures and encryption themselves, which come from the noble libraries, and whether a departure statement's signature checks out, which the models take as given in `proven`. The models cover the rules applied once those checks are done.

The models also leave out a few details of the code, on purpose:

- `taskSeal.open` returns a cached result for a ciphertext it already opened, without checking again. The cached result is for the same ciphertext, so it has the same revision.
- A task always has at least a title and a checklist, so the model never opens a task with no pieces.
- The suffix results assume every watched invoice in one token uses the same grid. Changing `PLAN_SUFFIX_DIGITS` or `PLAN_AMOUNT_DECIMALS` while invoices are open breaks that assumption.
- `matchTransfer` also matches an amount that arrived short by the NOX transfer fee, by exact value rather than by suffix. That path is not covered by `suffix_identifies`.

## How the proofs connect to the code

The models are executable. `lake exe vectors` runs them on chosen inputs, edge cases included, and writes the inputs and answers to JSON files in `formal/vectors`. Those files are committed, so the JavaScript tests run without Lean installed.

The tests read the vectors and call Nil's real functions:

- `server/test/formalCanonical.test.js` checks how BigInt reads and prints numbers, and feeds canonical and non-canonical strings to `checkBallot`, `checkEncryptedBallot` and the voting key route.
- `server/test/formalInvoice.test.js` checks `askAmount`, `sameSuffix`, `amountGrid`, `pickSuffix`, `usdToUnits` and `unitsToUsd` directly, and `coverage` and `settleInvoice` on invoice rows written to a test database. It also checks that `permute` is a bijection for several keys, since its HMAC is not in the model.
- `server/test/formalTally.test.js` encrypts ballots on Baby Jubjub, sums them with `aggregateBallots` and decrypts them with `combineTotals` from the key shares the model computed.
- `client/test/formalRollback.test.js` replays rollback sequences through `isRollback` and `taskVersions`.
- `client/test/formalStealth.test.js` checks that `stealthKey` gives the payee the key to the address `newStealthPayment` paid.
- `client/test/formalChatRoster.test.js` runs every member-list case through both the browser's `chatRosterRule` and the server's `rosterRule`, which must each give the model's answer.
- `client/test/formalChatStreams.test.js` feeds timelines an honest or dishonest server might deliver, with the marks it served, to `chatStreams`, whose notices must be the model's.
- `client/test/formalChatHistory.test.js` replays message versions through `editHistory` the way `openMessage` uses it, and timelines through `lateUnderOldKey`.
- `client/test/formalChatSeal.test.js` checks that `sealBlockers` refuses exactly where the model does, for the same reason.

Two of them guard the fix for the leading-zero bug the audit found: ballot nullifiers and voting keys written any way but the canonical one are refused, by both ballot checks and by the voting key route.

If someone changes the code and the tests start failing, either the code no longer does what the proofs are about, or the model needs to change with it and the proofs checked again.

## Running it

You need [elan](https://github.com/leanprover/elan), which installs the Lean version named in `formal/lean-toolchain`. The proofs use only Lean's core library, so there is nothing else to download, and a build from scratch takes well under a minute.

```bash
npm run formal
```

This builds the proofs, fails if any Lean file uses `sorry`, `admit`, `native_decide` or declares an axiom, prints the axioms every main theorem rests on and fails if they go beyond `propext`, `Quot.sound` and `Classical.choice`, and writes the vectors again. CI runs the same and checks that the committed vectors are current. The differential tests are part of `npm test`.
