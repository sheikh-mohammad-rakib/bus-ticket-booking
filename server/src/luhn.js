// Luhn (mod-10) card-number validation for the mock payment gateway.
// Pure function; unit-tested in test/unit.test.mjs.
export function luhnValid(numStr) {
  const s = String(numStr || "");
  if (!s) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
