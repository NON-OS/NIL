import Nil.Invoice
import Vectors.Json

namespace Vectors
open Nil.Invoice

def DAY : Nat := 86400000
def PERIOD_DAYS : Nat := 30

def askCase (m : Int) (g t : Nat) : Json :=
  .obj [("minimum", int m), ("grid", num g), ("tail", num t), ("ask", num (askAmount m g t))]

def sameCase (v a g : Nat) : Json :=
  .obj [("value", num v), ("asked", num a), ("grid", num g), ("same", .bool (sameSuffix v a g))]

def gridCase (decimals digits : Nat) : Json :=
  let low := lowFor decimals 8
  .obj [("decimals", num decimals), ("digits", num digits), ("amountDecimals", num 8),
    ("low", num low), ("grid", num (grid low digits))]

def pickCase (digits : Nat) (slot : Option (Nat × Nat)) (taken draws : List Nat) : Json :=
  let r := pickSuffix (fun s => taken.contains s) digits slot draws
  .obj [("digits", num digits),
    ("slot", match slot with | some (i, c) => .obj [("index", num i), ("count", num c)] | none => .null),
    ("taken", nums taken), ("draws", nums draws), ("suffix", match r with | some s => num s | none => .null)]

def priceCase (micro decimals rate amount : Nat) : Json :=
  .obj [("microUsd", num micro), ("decimals", num decimals), ("rate", num rate),
    ("units", num (usdToUnits micro decimals rate)), ("amount", num amount),
    ("usd", num (unitsToUsd amount decimals rate))]

/-- coverage for an invoice with these (asked amount, grid, sent) per token. -/
def coverageCase (tokens : List (Nat × Nat × Nat)) : Json :=
  let covered := tokens.foldr (fun (amt, _, sent) acc => share sent amt + acc) 0
  .obj [("covered", num covered),
    ("tokens", .arr (tokens.map fun (amt, g, sent) =>
      let ask := topUp covered amt g
      .obj [("amount", num amt), ("grid", num g), ("sent", num sent),
        ("remaining", num (amt * left covered / SCALE)), ("ask", num ask),
        ("coveredAfterTopUp", num (covered - share sent amt + share (sent + ask) amt))]))]

def settleCase (wasOpen : Bool) (periods credit due sent asked : Nat) : Json :=
  let fraction := paidFraction due (if due = 0 then [] else [(sent, asked)])
  let span := periods * PERIOD_DAYS * DAY
  .obj [("open", .bool wasOpen), ("periods", num periods), ("periodDays", num PERIOD_DAYS),
    ("credit", num credit), ("due", num due), ("total", num (credit + due)),
    ("sent", num sent), ("asked", num asked), ("fraction", num fraction),
    ("grantedMs", num (settledTime wasOpen span credit due (credit + due) fraction))]

def invoiceJson : Json :=
  let draws (k : Nat) (f : Nat → Nat) := (List.range 32).map fun i => f (i + k)
  .obj [
    ("askAmount", .arr [askCase 0 100 7, askCase (-5) 100 7, askCase 1 100 7, askCase 100 100 7,
      askCase 101 100 7, askCase 199 100 42, askCase 12345 1 0, askCase 5 1000000 999999,
      askCase (10 ^ 30 + 1) (10 ^ 6) 4321, askCase 999999999 10000 1]),
    ("sameSuffix", .arr [sameCase 1000007 7 100, sameCase 1000107 7 100, sameCase 1000008 7 100,
      sameCase 70 7 100, sameCase 4200421 421 10000, sameCase 4200420 421 10000]),
    ("amountGrid", .arr [gridCase 6 4, gridCase 18 4, gridCase 8 4, gridCase 6 6, gridCase 18 2]),
    ("pickSuffix", .arr [
      pickCase 2 none [] (draws 0 fun i => i % 99),
      pickCase 2 none [1, 2, 3] (draws 0 fun i => i % 4),
      pickCase 2 none ((List.range 98).map (· + 1)) (draws 0 fun _ => 0),
      pickCase 2 none ((List.range 99).map (· + 1)) (draws 0 fun i => i % 99),
      pickCase 2 (some (3, 10)) [] (draws 0 fun i => i % 9),
      pickCase 2 (some (3, 10)) [28, 29, 30] (draws 0 fun i => i % 3),
      pickCase 2 (some (9, 10)) ((List.range 9).map (· + 82)) (draws 0 fun i => i % 9),
      pickCase 3 (some (0, 7)) [1] (draws 0 fun _ => 0)]),
    ("prices", .arr [priceCase 10000000 6 (10 ^ 18) 10000000, priceCase 1 18 (5 * 10 ^ 16) 3,
      priceCase 9990000 18 (123456789 * 10 ^ 9) (10 ^ 18 + 7), priceCase 0 6 (10 ^ 18) 0,
      priceCase 333333 6 (3 * 10 ^ 18) 1]),
    ("coverage", .arr [coverageCase [(1000000421, 10000, 0)],
      coverageCase [(1000000421, 10000, 500000000)], coverageCase [(1000000421, 10000, 1)],
      coverageCase [(1000000421, 10000, 1000000420)], coverageCase [(1000000421, 10000, 1000000421)],
      coverageCase [(1000000421, 10000, 2000000000)], coverageCase [(7, 1, 3)],
      coverageCase [(2000000123, 1000, 999999999), (40000000000123, 1000, 0)],
      coverageCase [(3000000000000000077, 100000000000, 1234567890123456789)]]),
    ("settle", .arr [settleCase false 1 0 10000000 1000000421 1000000421,
      settleCase false 1 0 10000000 1500000000 1000000421, settleCase false 3 0 30000000 1 1000000421,
      settleCase true 1 0 10000000 999999999 1000000421, settleCase true 1 0 10000000 1000000421 1000000421,
      settleCase false 2 4000000 16000000 1600000000 1600000077, settleCase false 1 10000000 0 0 0,
      settleCase false 12 1 99999999 3 7])]

end Vectors
