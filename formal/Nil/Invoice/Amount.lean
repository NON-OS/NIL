/-!
The integer arithmetic of an invoice amount (server/billing): askAmount, sameSuffix, the grid
from amountGrid, and the top-up coverage computes after a partial payment. Amounts are BigInt
in the JavaScript and natural numbers here; minimums can be negative in principle, so they are
integers, and askAmount clamps them at zero the way the code does.
-/

namespace Nil.Invoice

/-- askAmount(minimum, grid, tail): round the minimum up to the grid, then add the suffix. -/
def askAmount (minimum : Int) (grid tail : Nat) : Nat :=
  (minimum.toNat + grid - 1) / grid * grid + tail

/-- sameSuffix(value, asked, grid). -/
def sameSuffix (value asked grid : Nat) : Bool := value % grid == asked % grid

/-- amountGrid: `low` is one unit of the last decimal place in use, the grid is low · 10^digits,
and an invoice's suffix sits in the places below the grid as tail = suffix · low. -/
def grid (low digits : Nat) : Nat := low * 10 ^ digits
def tail (low suffix : Nat) : Nat := suffix * low

theorem price_ge (m : Nat) (g : Nat) (hg : 0 < g) : m ≤ (m + g - 1) / g * g := by
  have := Nat.div_add_mod (m + g - 1) g
  have := Nat.mod_lt (m + g - 1) hg
  rw [Nat.mul_comm]; omega

theorem price_lt (m : Nat) (g : Nat) (hg : 0 < g) : (m + g - 1) / g * g < m + g := by
  have := Nat.div_add_mod (m + g - 1) g
  rw [Nat.mul_comm]; omega

/-- The amount asked never under-charges: it is at least the minimum (the price in the token's
smallest units), because the price part rounds up. -/
theorem ask_ge_minimum (minimum : Int) (g t : Nat) (hg : 0 < g) :
    minimum ≤ (askAmount minimum g t : Int) := by
  have := price_ge minimum.toNat g hg
  simp only [askAmount]; omega

/-- And the price part over-charges by less than one grid step. -/
theorem ask_price_lt (minimum : Int) (g t : Nat) (hg : 0 < g) :
    askAmount minimum g t - t < minimum.toNat + g := by
  have := price_lt minimum.toNat g hg
  simp only [askAmount]; omega

theorem ask_mod (minimum : Int) (g t : Nat) (ht : t < g) : askAmount minimum g t % g = t := by
  simp only [askAmount]
  rw [Nat.mul_comm, Nat.mul_add_mod, Nat.mod_eq_of_lt ht]

theorem tail_lt (low digits suffix : Nat) (hl : 0 < low) (hs : suffix < 10 ^ digits) :
    tail low suffix < grid low digits := by
  simp only [tail, grid]; rw [Nat.mul_comm]; exact Nat.mul_lt_mul_of_pos_left hs hl

/-- A payment's suffix names its invoice: if one transferred value carries the suffix of two
invoices asked on the same grid, the two invoices have the same suffix. -/
theorem suffix_identifies (value low digits s s' : Nat) (m m' : Int) (hl : 0 < low)
    (hs : s < 10 ^ digits) (hs' : s' < 10 ^ digits)
    (h : sameSuffix value (askAmount m (grid low digits) (tail low s)) (grid low digits))
    (h' : sameSuffix value (askAmount m' (grid low digits) (tail low s')) (grid low digits)) :
    s = s' := by
  simp only [sameSuffix, beq_iff_eq] at h h'
  rw [ask_mod _ _ _ (tail_lt low digits s hl hs)] at h
  rw [ask_mod _ _ _ (tail_lt low digits s' hl hs')] at h'
  have : s * low = s' * low := by simp only [tail] at h h'; omega
  exact Nat.eq_of_mul_eq_mul_right hl this

/-! ## Live suffixes -/

/-- What an invoice contributes to suffix matching: its suffix, when it was made, and when its
window closes. Times are in milliseconds. -/
structure Live where
  suffix : Nat
  createdAt : Int
  expiresAt : Int

/-- liveSuffixes(now): invoices whose late window hasn't closed. -/
def isLive (late now : Int) (i : Live) : Bool := decide (i.expiresAt > now - late)

/-- createInvoice picks a suffix outside liveSuffixes() at the moment the invoice is made. -/
def pickedFresh (late : Int) : List Live → Prop
  | [] => True
  | i :: earlier => (∀ j ∈ earlier, isLive late i.createdAt j → j.suffix ≠ i.suffix) ∧
      pickedFresh late earlier

/-- Invoices still watched at any one time never share a suffix: each was picked away from every
invoice still live when it was made, and anything live now was live then too. The list is newest
first, and `now` is no earlier than any invoice's creation. -/
theorem live_suffixes_distinct (late now : Int) (l : List Live) (fresh : pickedFresh late l)
    (made : ∀ i ∈ l, i.createdAt ≤ now) :
    (l.filter (isLive late now)).Pairwise fun a b => a.suffix ≠ b.suffix := by
  induction l with
  | nil => simp
  | cons i earlier ih =>
    simp only [List.filter_cons]
    have rest := ih fresh.2 (fun j hj => made j (by simp [hj]))
    split
    · rename_i hi
      refine List.Pairwise.cons ?_ rest
      intro j hj
      have ⟨hjm, hjl⟩ := List.mem_filter.1 hj
      have hc := made i (by simp)
      have : isLive late i.createdAt j := by
        simp only [isLive, decide_eq_true_eq] at hjl ⊢; omega
      exact (fresh.1 j hjm this).symm
    · exact rest

/-- pickSuffix's last resort, a scan through the share: the first candidate not taken. -/
def firstFree (taken : Nat → Bool) : List Nat → Option Nat
  | [] => none
  | c :: cs => if taken c then firstFree taken cs else some c

/-- The suffix pickSuffix settles on is never one already taken. -/
theorem firstFree_fresh (taken : Nat → Bool) (cs : List Nat) (s : Nat)
    (h : firstFree taken cs = some s) : taken s = false ∧ s ∈ cs := by
  induction cs with
  | nil => simp [firstFree] at h
  | cons c cs ih =>
    simp only [firstFree] at h
    split at h
    · have := ih h; exact ⟨this.1, by simp [this.2]⟩
    · cases h; simp_all

end Nil.Invoice
