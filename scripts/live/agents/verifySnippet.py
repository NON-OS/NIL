"""Runs the Python receiver check from docs/ai-agents.md, copied unchanged, over deliveries the
agent service captured (exact bytes), plus tampered and stale copies of them.

    python3 -I verifySnippet.py <agent-service.jsonl> <signing secret>
"""
import hashlib
import hmac
import json
import sys
import time


# --- from docs/ai-agents.md, unchanged ---
def verify(secret: str, header: str, raw_body: bytes, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts.get("t", "0"))
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
# --- end ---


def main(log_path: str, secret: str) -> int:
    failures = 0
    entries = [json.loads(line) for line in open(log_path, encoding="utf-8") if line.strip()]
    entries = [e for e in entries if e.get("raw") and e.get("signature")]
    if not entries:
        print("no captured deliveries with raw bodies")
        return 1
    for e in entries:
        raw = e["raw"].encode("utf-8")
        age = int(time.time()) - int(e["timestamp"])
        # captured earlier, so widen the window by the delivery's age for the genuine copy
        genuine = verify(secret, e["signature"], raw, tolerance=age + 300)
        tampered = verify(secret, e["signature"], raw.replace(b'"', b"'", 1), tolerance=age + 300)
        stale = verify(secret, e["signature"], raw)  # the documented 5-minute window
        wrong_secret = verify(secret + "x", e["signature"], raw, tolerance=age + 300)
        ok = genuine and not tampered and not wrong_secret and (stale == (age <= 300))
        failures += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {e['event']:<16} genuine={genuine} tampered={tampered} wrong_secret={wrong_secret} within_5_min={stale} (age {age}s)")
    print(f"-- Python snippet: {len(entries) - failures} passed, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
