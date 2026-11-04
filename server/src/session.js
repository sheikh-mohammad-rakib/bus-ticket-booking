// Stateless signed user-session tokens: the token carries {userId, expiry} and
// an HMAC bound to a server secret, so no session table is needed. Kept as a
// pure codec (no req/res coupling) so it can be unit-tested —
// test/unit.test.mjs pins roundtrip, tamper-rejection and expiry.
//
// The codec is bound to ONE secret: rotate the secret and every outstanding
// token dies (that's the logout-everywhere behaviour documented in README).
import { createHmac, timingSafeEqual } from "node:crypto";

export function userSessionCodec(secret) {
  const sign = (userId, expMs) => {
    const payload = `${userId}.${expMs}`;
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  };

  const verify = (token) => {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [uid, exp, sig] = parts;
    // constant-time compare against an HMAC recomputed from the payload
    const expected = createHmac("sha256", secret).update(`${uid}.${exp}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const expMs = Number(exp);
    if (!Number.isInteger(expMs) || Date.now() > expMs) return null;
    const id = Number(uid);
    return Number.isInteger(id) ? id : null;
  };

  return { sign, verify };
}
