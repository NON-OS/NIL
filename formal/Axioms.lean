import Lean
import Nil

/-!
The axiom check. `#check_axioms` prints what each main theorem rests on, as `#print axioms`
does, and fails the build if that is anything beyond propext, Quot.sound and Classical.choice.
A `sorry` shows up here as sorryAx, and `native_decide` as Lean.ofReduceBool, so both fail too.
-/

open Lean Elab Command

elab "#check_axioms " ids:ident+ : command => do
  let allowed := [``propext, ``Quot.sound, ``Classical.choice]
  for id in ids do
    let name ← liftCoreM <| realizeGlobalConstNoOverload id
    let axs ← liftCoreM <| collectAxioms name
    logInfoAt id m!"'{name}' depends on axioms: {axs.toList}"
    for a in axs do
      unless allowed.contains a do
        throwErrorAt id m!"'{name}' depends on {a}, which is not allowed"

#check_axioms
  Nil.Canonical.canonical_eq_iff
  Nil.Canonical.canonical_string_eq_iff
  Nil.Canonical.round_trip
  Nil.Canonical.digits_value
  Nil.Canonical.dedup_by_string_eq_by_number
  Nil.Canonical.leading_zero_example
  Nil.Tally.aggregate_enc
  Nil.Tally.decrypt_enc
  Nil.Tally.decrypt_aggregate
  Nil.Tally.threshold_eq_decrypt
  Nil.Tally.threshold_total
  Nil.Tally.solve_total
  Nil.Tally.decryption_depends_only_on_total
  Nil.Tally.single_ballot_total
  Nil.Stealth.key_controls_address
  Nil.Stealth.reduced_key_controls_address
  Nil.Stealth.address_eq_iff
  Nil.Stealth.distinct_addresses
  Nil.Rollback.honest_never_warns
  Nil.Rollback.warns_iff
  Nil.Rollback.older_always_warns
  Nil.Rollback.mixed_always_warns
  Nil.Invoice.halfFor_covers
  Nil.Invoice.permute_total
  Nil.Invoice.permute_range
  Nil.Invoice.permute_inj
  Nil.Invoice.permute_onto
  Nil.Invoice.slots_disjoint
  Nil.Invoice.ask_ge_minimum
  Nil.Invoice.ask_price_lt
  Nil.Invoice.suffix_identifies
  Nil.Invoice.live_suffixes_distinct
  Nil.Invoice.firstFree_fresh
  Nil.Invoice.pickSuffix_fresh
  Nil.Invoice.topUp_same_suffix
  Nil.Invoice.topUp_completes
  Nil.Invoice.owed_le_paid
  Nil.Invoice.owed_proportional
  Nil.Invoice.owed_mono
  Nil.Invoice.owed_exact
  Nil.Invoice.owed_full
  Nil.Invoice.owed_le_sent
  Nil.Invoice.granted_le_owed
  Nil.Invoice.granted_le_most
  Nil.Invoice.granted_mono
  Nil.Invoice.granted_exact
  Nil.Invoice.grant_again
  Nil.Invoice.usdToUnits_covers
  Nil.Invoice.unitsToUsd_le
  Nil.Invoice.noxDue_ge
  Nil.Invoice.draw_off_balance
  Nil.Invoice.cancel_refunds
