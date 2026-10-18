/-!
Canonical decimals. A ballot's nullifier, Merkle root and commitments arrive as decimal strings,
and the server stores ballots keyed by the nullifier string. A string is canonical when it is
"0" or starts with a nonzero digit, has only digits, and is below the field order. The finding
this guards against: "0" followed by n verified as n but was stored as a separate ballot.
-/

namespace Nil.Canonical

/-- The BN254 scalar field order, the field Semaphore's and the ballot circuit's numbers live in. -/
def fieldOrder : Nat :=
  21888242871839275222246405745257275088548364400416034343698204186575808495617

def digitVal (c : Char) : Nat := c.toNat - '0'.toNat

def digitChar (d : Nat) : Char := Char.ofNat ('0'.toNat + d)

/-- The number a string of digits denotes, as BigInt reads it. -/
def value (l : List Char) : Nat := l.foldl (fun acc c => acc * 10 + digitVal c) 0

/-- The decimal digits of n, most significant first, as BigInt's toString prints them. -/
def digits (n : Nat) : List Char :=
  if n < 10 then [digitChar n] else digits (n / 10) ++ [digitChar (n % 10)]
decreasing_by omega

def noLeadingZero : List Char → Prop
  | [] => False
  | [_] => True
  | c :: _ :: _ => c ≠ '0'

instance (l : List Char) : Decidable (noLeadingZero l) := by
  unfold noLeadingZero; split <;> infer_instance

/-- Canonical form: digits only, no leading zero except "0" itself, below the field order. -/
def canonical (l : List Char) : Prop :=
  (∀ c ∈ l, c.isDigit) ∧ noLeadingZero l ∧ value l < fieldOrder

instance (l : List Char) : Decidable (canonical l) := by
  unfold canonical; infer_instance

def isCanonical (s : String) : Bool := decide (canonical s.toList)

/-! ## Digits -/

theorem isDigit_iff (c : Char) : c.isDigit ↔ 48 ≤ c.toNat ∧ c.toNat ≤ 57 := by
  simp [Char.isDigit, UInt32.le_iff_toNat_le, Char.toNat]

theorem toNat_ofNat (n : Nat) (h : n < 55296) : (Char.ofNat n).toNat = n := by
  rw [Char.toNat, Char.ofNat, dif_pos (Or.inl h)]
  simp [Char.ofNatAux]

theorem digitVal_lt {c : Char} (h : c.isDigit) : digitVal c < 10 := by
  have := (isDigit_iff c).1 h
  simp only [digitVal, show '0'.toNat = 48 from rfl]; omega

theorem digitChar_digitVal {c : Char} (h : c.isDigit) : digitChar (digitVal c) = c := by
  have := (isDigit_iff c).1 h
  simp only [digitChar, digitVal, show '0'.toNat = 48 from rfl]
  rw [show 48 + (c.toNat - 48) = c.toNat by omega, Char.ofNat_toNat]

theorem digitVal_digitChar {d : Nat} (h : d < 10) : digitVal (digitChar d) = d := by
  simp only [digitVal, digitChar, show '0'.toNat = 48 from rfl]
  rw [toNat_ofNat _ (by omega)]; omega

theorem digitChar_isDigit {d : Nat} (h : d < 10) : (digitChar d).isDigit := by
  rw [isDigit_iff, digitChar, show '0'.toNat = 48 from rfl, toNat_ofNat _ (by omega)]; omega

theorem digitChar_ne_zero {d : Nat} (h : d < 10) (h0 : d ≠ 0) : digitChar d ≠ '0' := by
  intro e
  have := congrArg digitVal e
  rw [digitVal_digitChar h] at this
  simp [digitVal] at this; omega

/-! ## Value -/

theorem revInd {P : List Char → Prop} (nil : P []) (snoc : ∀ l c, P l → P (l ++ [c])) :
    ∀ l, P l := by
  intro l; rw [← List.reverse_reverse l]
  induction l.reverse with
  | nil => exact nil
  | cons c t ih => rw [List.reverse_cons]; exact snoc _ _ ih

theorem value_append (l : List Char) (c : Char) : value (l ++ [c]) = value l * 10 + digitVal c := by
  simp [value, List.foldl_append]

theorem value_cons_ge (c : Char) (l : List Char) (hc : c.isDigit) (h0 : c ≠ '0')
    (hl : ∀ d ∈ l, d.isDigit) : 10 ^ l.length ≤ value (c :: l) := by
  induction l using revInd with
  | nil =>
    simp [value]
    have : digitVal c ≠ 0 := by
      intro e; apply h0
      rw [← digitChar_digitVal hc, e]; rfl
    omega
  | snoc l d ih =>
    rw [← List.cons_append, value_append, List.length_append, List.length_singleton, Nat.pow_succ]
    have := ih (fun x hx => hl x (List.mem_append_left _ hx))
    simp at this ⊢; omega

theorem value_lt (l : List Char) (hl : ∀ d ∈ l, d.isDigit) : value l < 10 ^ l.length := by
  induction l using revInd with
  | nil => simp [value]
  | snoc l d ih =>
    rw [value_append, List.length_append, List.length_singleton, Nat.pow_succ]
    have := ih (fun x hx => hl x (List.mem_append_left _ hx))
    have := digitVal_lt (hl d (by simp))
    simp; omega

/-! ## Printing -/

theorem digits_eq (n : Nat) :
    digits n = if n < 10 then [digitChar n] else digits (n / 10) ++ [digitChar (n % 10)] := by
  rw [digits]

theorem value_digits (n : Nat) : value (digits n) = n := by
  induction n using Nat.strongRecOn with
  | _ n ih =>
    rw [digits_eq]
    split
    · simp [value, digitVal_digitChar (by assumption : n < 10)]
    · rw [value_append, ih (n / 10) (by omega), digitVal_digitChar (Nat.mod_lt _ (by decide))]
      omega

theorem digits_isDigit (n : Nat) : ∀ c ∈ digits n, c.isDigit := by
  induction n using Nat.strongRecOn with
  | _ n ih =>
    rw [digits_eq]
    split
    · simp; exact digitChar_isDigit (by assumption)
    · intro c hc
      simp only [List.mem_append, List.mem_singleton] at hc
      rcases hc with hc | hc
      · exact ih (n / 10) (by omega) c hc
      · subst hc; exact digitChar_isDigit (Nat.mod_lt _ (by decide))

theorem digits_head (n : Nat) (h : 10 ≤ n) : ∃ c t, digits n = c :: t ∧ c ≠ '0' := by
  induction n using Nat.strongRecOn with
  | _ n ih =>
    rw [digits_eq, if_neg (by omega)]
    by_cases h' : n / 10 < 10
    · refine ⟨digitChar (n / 10), [digitChar (n % 10)], ?_, digitChar_ne_zero h' (by omega)⟩
      rw [digits_eq, if_pos h']; rfl
    · obtain ⟨c, t, e, hc⟩ := ih (n / 10) (by omega) (by omega)
      exact ⟨c, t ++ [digitChar (n % 10)], by rw [e]; rfl, hc⟩

theorem digits_noLeadingZero (n : Nat) : noLeadingZero (digits n) := by
  by_cases h : n < 10
  · rw [digits_eq, if_pos h]; trivial
  · obtain ⟨c, t, e, hc⟩ := digits_head n (by omega)
    rw [e]
    cases t with
    | nil =>
      have := value_digits n
      rw [e] at this
      have := digitVal_lt (digits_isDigit n c (by rw [e]; simp))
      simp [value] at *; omega
    | cons _ _ => exact hc

/-- Printing a number below the field order always gives a canonical string. -/
theorem digits_canonical (n : Nat) (h : n < fieldOrder) : canonical (digits n) :=
  ⟨digits_isDigit n, digits_noLeadingZero n, by rw [value_digits]; exact h⟩

/-- Parsing a canonical string and printing it again gives back the same string. -/
theorem digits_value (l : List Char) (h : canonical l) : digits (value l) = l := by
  obtain ⟨hd, hz, -⟩ := h
  induction l using revInd with
  | nil => exact absurd hz id
  | snoc l c ih =>
    have hc := hd c (by simp)
    have hl : ∀ d ∈ l, d.isDigit := fun d hm => hd d (List.mem_append_left _ hm)
    cases l with
    | nil =>
      simp only [List.nil_append, value, List.foldl_cons, List.foldl_nil, Nat.zero_mul,
        Nat.zero_add]
      rw [digits_eq, if_pos (digitVal_lt hc), digitChar_digitVal hc]
    | cons a t =>
      have ha : a ≠ '0' := by
        cases t <;> simpa [noLeadingZero] using hz
      have hge := value_cons_ge a t (hl a (by simp)) ha (fun d hm => hl d (by simp [hm]))
      have hpos : 1 ≤ 10 ^ t.length := Nat.pow_pos (by decide)
      have hz' : noLeadingZero (a :: t) := by cases t <;> simp [noLeadingZero, ha]
      rw [value_append, digits_eq, if_neg (by omega)]
      have hcv := digitVal_lt hc
      rw [show (value (a :: t) * 10 + digitVal c) / 10 = value (a :: t) by omega,
        show (value (a :: t) * 10 + digitVal c) % 10 = digitVal c by omega,
        ih hl hz', digitChar_digitVal hc]

/-! ## Main results -/

/-- Two canonical strings denote the same number exactly when they are the same string, so a
canonical nullifier names one voter's ballot one way only. -/
theorem canonical_eq_iff (a b : List Char) (ha : canonical a) (hb : canonical b) :
    value a = value b ↔ a = b := by
  constructor
  · intro e; rw [← digits_value a ha, ← digits_value b hb, e]
  · intro e; rw [e]

/-- The same for the strings the server compares: accepted nullifiers are equal as numbers
exactly when they are equal as strings. -/
theorem canonical_string_eq_iff (a b : String) (ha : isCanonical a) (hb : isCanonical b) :
    value a.toList = value b.toList ↔ a = b := by
  rw [canonical_eq_iff _ _ (of_decide_eq_true ha) (of_decide_eq_true hb)]
  constructor
  · intro h; cases a; cases b; simp_all [String.toList]
  · intro h; rw [h]

/-- The parse/print round trip: every number below the field order has exactly one canonical
string, the one BigInt prints, and reading it back gives the number. -/
theorem round_trip (n : Nat) (h : n < fieldOrder) :
    canonical (digits n) ∧ value (digits n) = n :=
  ⟨digits_canonical n h, value_digits n⟩

/-- The finding: "07" reads as 7 but is a different string, and it isn't canonical. -/
theorem leading_zero_example : value "07".toList = value "7".toList ∧ "07".toList ≠ "7".toList ∧
    ¬ canonical "07".toList := by
  refine ⟨by decide, by decide, ?_⟩
  intro h; exact h.2.1 rfl

/-! ## Deduplication -/

/-- Drop repeated entries, the way a table keyed by the nullifier keeps one row per key. -/
def dedup {α : Type} [DecidableEq α] : List α → List α
  | [] => []
  | a :: l => if a ∈ l then dedup l else a :: dedup l

theorem dedup_map {α β : Type} [DecidableEq α] [DecidableEq β] (f : α → β) (l : List α)
    (inj : ∀ a ∈ l, ∀ b ∈ l, f a = f b → a = b) : dedup (l.map f) = (dedup l).map f := by
  induction l with
  | nil => rfl
  | cons a l ih =>
    have ih' := ih (fun x hx y hy => inj x (by simp [hx]) y (by simp [hy]))
    have hmem : f a ∈ l.map f ↔ a ∈ l := by
      constructor
      · intro h
        obtain ⟨b, hb, e⟩ := List.mem_map.1 h
        rw [inj b (by simp [hb]) a (by simp) e] at hb; exact hb
      · intro h; exact List.mem_map_of_mem h
    simp only [List.map_cons, dedup, hmem]
    split <;> simp [ih']

/-- When every accepted nullifier is canonical, counting ballots by distinct string counts the
same as counting by distinct number, so one voter's ballot can't be counted twice. -/
theorem dedup_by_string_eq_by_number (l : List (List Char)) (h : ∀ s ∈ l, canonical s) :
    (dedup l).length = (dedup (l.map value)).length := by
  rw [dedup_map value l (fun a ha b hb e => (canonical_eq_iff a b (h a ha) (h b hb)).1 e),
    List.length_map]

end Nil.Canonical
