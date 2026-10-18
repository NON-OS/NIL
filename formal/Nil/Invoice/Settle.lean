import Nil.Invoice.Amount

/-!
Underpayment, overpayment and credit (server/billing: coverage, paidFraction, settleInvoice,
creditBalance, createInvoice). Fractions of an invoice are counted in billionths, SCALE = 10^9,
and every division is BigInt division, which rounds down for these non-negative values.
-/

namespace Nil.Invoice

def SCALE : Nat := 1000000000

/-- One token's share of an invoice: (amount sent, counting any fee the token kept) · SCALE /
the amount asked in that token. -/
def share (sent asked : Nat) : Nat := sent * SCALE / asked

theorem share_le (sent asked : Nat) : share sent asked * asked ≤ sent * SCALE :=
  Nat.div_mul_le_self _ _

theorem div_add_div_le (a b c : Nat) : a / c + b / c ≤ (a + b) / c := by
  rcases Nat.eq_zero_or_pos c with h | h
  · subst h; simp
  · apply (Nat.le_div_iff_mul_le h).2
    rw [Nat.add_mul]
    exact Nat.add_le_add (Nat.div_mul_le_self _ _) (Nat.div_mul_le_self _ _)

/-! ## Underpayment: the rest to send -/

/-- coverage: what is left of the invoice after `covered` billionths, and for a token whose
asked amount is `amt` on grid `g`, the exact amount to send to finish. -/
def left (covered : Nat) : Nat := if covered < SCALE then SCALE - covered else 0

def topUp (covered amt g : Nat) : Nat :=
  if 0 < covered ∧ covered < SCALE then askAmount ((amt * left covered / SCALE : Nat) : Int) g (amt % g)
  else amt

theorem topUp_partial (covered amt g : Nat) (h : 0 < covered ∧ covered < SCALE) :
    topUp covered amt g = (amt * left covered / SCALE + g - 1) / g * g + amt % g := by
  unfold topUp; rw [if_pos h]; simp only [askAmount, Int.toNat_natCast]

/-- The "send the rest" amount ends in the same suffix as the invoice amount, so the top-up is
matched to the same invoice. -/
theorem topUp_same_suffix (covered amt g : Nat) (hg : 0 < g) :
    topUp covered amt g % g = amt % g := by
  simp only [topUp]
  split
  · exact ask_mod _ _ _ (Nat.mod_lt _ hg)
  · rfl

/-- After a partial payment, sending the top-up in any one token finishes the invoice: the new
coverage reaches SCALE. `others` is what the other tokens already cover. This needs the suffix
part of the asked amount to be nonzero, which holds since suffixes start at 1. -/
theorem topUp_completes (others arr amt g : Nat) (hamt : 0 < amt) (hg : 0 < g)
    (htail : 0 < amt % g)
    (hpart : 0 < others + share arr amt ∧ others + share arr amt < SCALE) :
    SCALE ≤ others + share (arr + topUp (others + share arr amt) amt g) amt := by
  have hS : 0 < SCALE := by decide
  generalize hc : others + share arr amt = covered at hpart ⊢
  have hl : left covered = SCALE - covered := by simp [left, hpart.2]
  have hask : amt * left covered / SCALE + 1 ≤ topUp covered amt g := by
    have hp := price_ge (amt * left covered / SCALE) g hg
    rw [topUp_partial covered amt g hpart]; generalize amt * left covered / SCALE = r at hp ⊢; omega
  generalize hr : amt * left covered / SCALE = rem at hask
  -- what the top-up adds is at least what was left
  have hrem : amt * left covered < (rem + 1) * SCALE := by
    have := Nat.div_add_mod (amt * left covered) SCALE
    have := Nat.mod_lt (amt * left covered) hS
    rw [Nat.add_mul, Nat.one_mul, Nat.mul_comm rem, ← hr]; omega
  have hadd : left covered ≤ share (topUp covered amt g) amt := by
    apply (Nat.le_div_iff_mul_le hamt).2
    have : (rem + 1) * SCALE ≤ topUp covered amt g * SCALE := Nat.mul_le_mul_right _ hask
    rw [Nat.mul_comm]; omega
  have hsplit : share arr amt + share (topUp covered amt g) amt
      ≤ share (arr + topUp covered amt g) amt := by
    simp only [share, Nat.add_mul]; exact div_add_div_le _ _ _
  omega

/-! ## Overpayment: Pro time in proportion -/

/-- settleInvoice: the Pro time owed for a "periods" invoice. `credit` and `due` are the micro-USD
the invoice drew from credit and asked to be paid, `fraction` is paidFraction in billionths,
and `span` is periods · periodDays · DAY in milliseconds. -/
def owed (span credit due total fraction : Nat) : Nat :=
  span * (credit * SCALE + due * fraction) / (total * SCALE)

/-- The time granted never exceeds the time paid for: owed / span ≤ (credit + due · fraction /
SCALE) / total, rounded down to the millisecond. -/
theorem owed_le_paid (span credit due total fraction : Nat) :
    owed span credit due total fraction * (total * SCALE) ≤ span * (credit * SCALE + due * fraction) :=
  Nat.div_mul_le_self _ _

/-- In proportion: the time granted is short of the exact share by less than a millisecond. -/
theorem owed_proportional (span credit due total fraction : Nat) (ht : 0 < total) :
    span * (credit * SCALE + due * fraction) < (owed span credit due total fraction + 1) * (total * SCALE) := by
  have hpos : 0 < total * SCALE := Nat.mul_pos ht (by decide)
  have := Nat.div_add_mod (span * (credit * SCALE + due * fraction)) (total * SCALE)
  have := Nat.mod_lt (span * (credit * SCALE + due * fraction)) hpos
  simp only [owed]; rw [Nat.add_mul, Nat.one_mul, Nat.mul_comm (_ / _)]; omega

/-- Paying more never buys less time. -/
theorem owed_mono (span credit due total f f' : Nat) (h : f ≤ f') :
    owed span credit due total f ≤ owed span credit due total f' :=
  Nat.div_le_div_right (Nat.mul_le_mul_left _ (Nat.add_le_add_left (Nat.mul_le_mul_left _ h) _))

/-- Paying exactly the invoice buys exactly the periods on it. -/
theorem owed_exact (span credit due total : Nat) (ht : 0 < total) (sum : credit + due = total) :
    owed span credit due total SCALE = span := by
  simp only [owed]
  rw [← Nat.add_mul, sum, Nat.mul_div_cancel _ (Nat.mul_pos ht (by decide))]

/-- Paying at least the invoice buys at least the periods on it; anything above buys extra time. -/
theorem owed_full (span credit due total f : Nat) (ht : 0 < total) (sum : credit + due = total)
    (hf : SCALE ≤ f) : span ≤ owed span credit due total f := by
  have := owed_mono span credit due total _ _ hf
  rwa [owed_exact span credit due total ht sum] at this

theorem rearrange1 (a b c d e f : Nat) : a * (b * c + d * e) * f = a * (b * c * f + d * (e * f)) := by
  grind
theorem rearrange2 (a b c d e f : Nat) : a * (b * c + d * e) * f = a * (b * f * c + d * (e * f)) := by
  grind
theorem rearrange3 (a b c d : Nat) : a * b * c * d = a * (b * d) * c := by grind

/-- With one token, the time granted is never more than the money that arrived pays for:
owed · total · asked ≤ span · (credit · asked + due · sent). -/
theorem owed_le_sent (span credit due total sent asked : Nat) :
    owed span credit due total (share sent asked) * total * asked
      ≤ span * (credit * asked + due * sent) := by
  have h1 := owed_le_paid span credit due total (share sent asked)
  have h2 := share_le sent asked
  have hS : 0 < SCALE := by decide
  refine Nat.le_of_mul_le_mul_right (c := SCALE) ?_ hS
  have h3 : owed span credit due total (share sent asked) * (total * SCALE) * asked
      ≤ span * (credit * SCALE + due * share sent asked) * asked := Nat.mul_le_mul_right _ h1
  have h4 : span * (credit * SCALE + due * share sent asked) * asked
      ≤ span * (credit * asked + due * sent) * SCALE := by
    have : due * (share sent asked * asked) ≤ due * (sent * SCALE) := Nat.mul_le_mul_left _ h2
    rw [rearrange1, rearrange2]; exact Nat.mul_le_mul_left _ (Nat.add_le_add_left this _)
  rw [rearrange3]; exact Nat.le_trans h3 h4

/-- paidFraction: SCALE when nothing was due after credit, else the sum of each token's share. -/
def paidFraction (due : Nat) (tokens : List (Nat × Nat)) : Nat :=
  if due = 0 then SCALE else tokens.foldr (fun (sent, asked) acc => share sent asked + acc) 0

/-- The Pro time settleInvoice grants a "periods" invoice in total: nothing while an open invoice
is short of being paid, otherwise what `owed` says. -/
def settledTime (wasOpen : Bool) (span credit due total fraction : Nat) : Nat :=
  if total = 0 || (wasOpen && fraction < SCALE) then 0 else owed span credit due total fraction

/-- settleInvoice adds only the difference from what was already granted, so settling the same
payments again adds nothing. Returns (granted afterwards, time added). -/
def grant (granted owedNow : Nat) : Nat × Nat :=
  if granted < owedNow then (owedNow, owedNow - granted) else (granted, 0)

theorem grant_again (granted owedNow : Nat) :
    (grant (grant granted owedNow).1 owedNow).2 = 0 := by
  simp only [grant]; split <;> simp

end Nil.Invoice
