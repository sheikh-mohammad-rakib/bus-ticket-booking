// Cancellation charge rules, as a pure function so the money math can be
// unit-tested (test/unit.test.mjs pins the boundary cases):
//   fee = 10% of what was paid, at least ৳50, rounded UP to the next ৳50 step.
// e.g. total 950  → 95 → ceil to ৳100
//      total 499  → 49.9 → floor is below minimum → ৳50
//      total 501  → 50.1 → ceil to ৳100
export function cancellationFee(total) {
  const n = Number(total) || 0;
  return Math.max(50, Math.ceil((n * 0.1) / 50) * 50);
}
