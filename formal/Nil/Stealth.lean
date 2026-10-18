import Nil.Group

/-!
Private payouts (ERC-5564 scheme 1, client/src/lib/stealth). The payee publishes S = s·G. A
payer derives a shared-secret hash h and pays to P = S + h·G (newStealthPayment); the payee
spends with k = (s + h) mod n (stealthKey). Here h is any scalar: the hash and the curve
arithmetic are outside the model.
-/

namespace Nil.Stealth

open IntGroup

variable {G : Type} [IntGroup G]

def oneTimeAddress (g S : G) (h : Int) : G := S + h • g

def oneTimeKey (n s h : Int) : Int := (s + h) % n

/-- The one-time key s + h controls the one-time address: k·G = S + h·G. -/
theorem key_controls_address (g : G) (s h : Int) :
    (s + h) • g = oneTimeAddress g (s • g) h := by
  rw [oneTimeAddress, add_smul]

/-- The same holds for the key as stealthKey stores it, reduced modulo the group order. -/
theorem reduced_key_controls_address (P : PrimeOrder G) (s h : Int) :
    oneTimeKey P.q s h • P.gen = oneTimeAddress P.gen (s • P.gen) h := by
  rw [oneTimeKey, P.smul_emod, key_controls_address]

/-- Two payouts to the same person land on the same address only if their hashes agree modulo
the group order. -/
theorem address_eq_iff (P : PrimeOrder G) (S : G) (h h' : Int) :
    oneTimeAddress P.gen S h = oneTimeAddress P.gen S h' ↔ P.q ∣ h - h' := by
  rw [← P.gen_smul_eq_iff]
  constructor
  · intro e
    have := congrArg (· - S) e
    simp only [oneTimeAddress] at this
    rwa [add_comm S, add_comm S, add_sub_cancel, add_sub_cancel] at this
  · intro e; simp only [oneTimeAddress, e]

/-- Payouts with different hashes in [0, n) go to different addresses, because the generator has
order exactly n (newStealthPayment only uses hashes in [1, n)). -/
theorem distinct_addresses (P : PrimeOrder G) (S : G) (h h' : Int)
    (hr : 0 ≤ h ∧ h < P.q) (hr' : 0 ≤ h' ∧ h' < P.q) (ne : h ≠ h') :
    oneTimeAddress P.gen S h ≠ oneTimeAddress P.gen S h' := by
  intro e
  exact ne (P.eq_of_dvd_of_range ((address_eq_iff P S h h').1 e) hr.1 hr.2 hr'.1 hr'.2)

end Nil.Stealth
