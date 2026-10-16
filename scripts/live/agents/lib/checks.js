// A tiny result log for the live checks: each check prints one line, failures are counted, and
// the process exits non-zero if any failed.
export default function checks(title) {
  let failed = 0;
  let passed = 0;
  console.log(`\n== ${title}`);
  const log = {
    ok(cond, what, detail = '') {
      if (cond) passed += 1;
      else failed += 1;
      console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
      return cond;
    },
    note(text) {
      console.log(`      ${text}`);
    },
    done() {
      console.log(`-- ${title}: ${passed} passed, ${failed} failed`);
      if (failed) process.exitCode = 1;
      return failed;
    },
  };
  return log;
}
