/-!
Prices and credit (server/billing: usdToUnits, unitsToUsd, createInvoice, creditBalance).
Prices are micro-USD, rates are USD per whole token scaled by 10^18.
-/

namespace Nil.Invoice

def MICRO : Nat := 1000000
def E18 : Nat := 1000000000000000000

def ceilDiv (n d : Nat) : Nat := (n + d - 1) / d

theorem ceilDiv_ge (n d : Nat) (hd : 0 < d) : n ≤ ceilDiv n d * d := by
  have := Nat.div_add_mod (n + d - 1) d
  have := Nat.mod_lt (n + d - 1) hd
  simp only [ceilDiv]; rw [Nat.mul_comm]; omega

/-- usdToUnits: the token amount for a price, rounded up. -/
def usdToUnits (microUsd decimals rate : Nat) : Nat :=
  ceilDiv (microUsd * 10 ^ decimals * E18) (MICRO * rate)

/-- The units asked are worth at least the price at the locked rate, so the treasury never
receives less than the price. -/
theorem usdToUnits_covers (microUsd decimals rate : Nat) (hr : 0 < rate) :
    microUsd * 10 ^ decimals * E18 ≤ usdToUnits microUsd decimals rate * (MICRO * rate) :=
  ceilDiv_ge _ _ (Nat.mul_pos (by decide) hr)

/-- unitsToUsd: what an amount is worth, rounded down. -/
def unitsToUsd (amount decimals rate : Nat) : Nat := amount * rate * MICRO / (10 ^ decimals * E18)

/-- Credit from a payment is never more than what arrived was worth. -/
theorem unitsToUsd_le (amount decimals rate : Nat) :
    unitsToUsd amount decimals rate * (10 ^ decimals * E18) ≤ amount * rate * MICRO :=
  Nat.div_mul_le_self _ _

/-- The NOX part of an invoice after its discount, Math.ceil(due · (100 − percent) / 100). The
JavaScript divides floating-point numbers; for whole micro-USD amounts below 2^53 / 100 that is
this exact ceiling. -/
def noxDue (due percent : Nat) : Nat := ceilDiv (due * (100 - percent)) 100

theorem noxDue_ge (due percent : Nat) : due * (100 - percent) ≤ noxDue due percent * 100 :=
  ceilDiv_ge _ _ (by decide)

/-! ## Credit -/

/-- creditBalance: the pool of unspent money, clamped at zero. -/
def balance (pool : Int) : Nat := pool.toNat

/-- createInvoice draws min(creditBalance(), total) and asks for the rest. -/
def draw (pool : Int) (total : Nat) : Nat := min (balance pool) total

theorem draw_split (pool : Int) (total : Nat) : draw pool total + (total - draw pool total) = total := by
  simp only [draw]; omega

/-- The credit a new invoice draws comes off the balance exactly (creditBalance subtracts every
invoice's credit_usd), so the same credit can't fund two invoices. -/
theorem draw_off_balance (pool : Int) (total : Nat) :
    balance (pool - draw pool total) = balance pool - draw pool total := by
  simp only [balance, draw]; omega

/-- Cancelling or letting an unpaid invoice expire hands back what it drew plus what was paid
into it on time. -/
theorem cancel_refunds (pool : Int) (credit paid : Nat) :
    pool - credit + (credit + paid) = pool + paid := by omega

end Nil.Invoice
