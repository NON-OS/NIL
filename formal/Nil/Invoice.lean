import Nil.Invoice.Walk
import Nil.Invoice.Permute
import Nil.Invoice.Amount
import Nil.Invoice.Settle
import Nil.Invoice.Credit

/-!
Invoice arithmetic, split by topic:

- Walk and Permute: the keyed suffix shuffle is a bijection, and slots never collide.
- Amount: askAmount rounds up, a suffix names one invoice, live suffixes are distinct.
- Settle: the top-up keeps the suffix and finishes the invoice; overpayment buys time in
  proportion and never more than was paid for.
- Credit: price conversions round in the treasury's favour; credit is drawn once.
-/
