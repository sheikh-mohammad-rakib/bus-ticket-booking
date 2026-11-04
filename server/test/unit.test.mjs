// Unit tests for the pure logic — no server, no database. Run with:
//   cd server && npm run unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationFee } from "../src/fares.js";
import { luhnValid } from "../src/luhn.js";
import { userSessionCodec } from "../src/session.js";

// ---------- cancellation fee: 10%, min ৳50, rounded up to ৳50 steps ----------
test("cancellationFee: exact 10% at or above the minimum is used verbatim when on a ৳50 step", () => {
  assert.equal(cancellationFee(500), 50);        // 10% = 50 → minimum
  assert.equal(cancellationFee(1000), 100);      // 10% = 100, no rounding
  assert.equal(cancellationFee(12000), 1200);
});

test("cancellationFee: rounds 10% UP to the next ৳50 step", () => {
  assert.equal(cancellationFee(950), 100);       // 95 → 100 (smoke pins this fare)
  assert.equal(cancellationFee(501), 100);       // 50.1 → 100
  assert.equal(cancellationFee(550), 100);       // 55 → 100
  assert.equal(cancellationFee(551), 100);       // 55.1 → 100
  assert.equal(cancellationFee(999), 100);       // 99.9 → 100
  assert.equal(cancellationFee(1000), 100);      // exactly 100
  assert.equal(cancellationFee(1001), 150);      // 100.1 → 150
});

test("cancellationFee: ৳50 floor applies to small tickets", () => {
  assert.equal(cancellationFee(100), 50);        // 10% = 10 → minimum
  assert.equal(cancellationFee(499), 50);        // 49.9 → still below/at minimum
});

test("cancellationFee: defensive on nonsense input", () => {
  assert.equal(cancellationFee(0), 50);
  assert.equal(cancellationFee(-400), 50);
  assert.equal(cancellationFee(undefined), 50);
  assert.equal(cancellationFee("abc"), 50);
});

// ---------- Luhn card validation ----------
test("luhnValid: accepts well-known live test cards", () => {
  assert.equal(luhnValid("4111111111111111"), true);   // Visa test number
  assert.equal(luhnValid("4242424242424242"), true);   // Stripe confirmation number
});

test("luhnValid: rejects a single flipped digit", () => {
  assert.equal(luhnValid("4111111111111112"), false);
  assert.equal(luhnValid("4242424242424243"), false);
});

test("luhnValid: rejects non-numeric junk and empty input", () => {
  assert.equal(luhnValid("4111-1111--------111a"), false);
  assert.equal(luhnValid(""), false);
  assert.equal(luhnValid(null), false);
  assert.equal(luhnValid(undefined), false);
});

// ---------- user session codec ----------
const codec = userSessionCodec("test-secret");
const otherCodec = userSessionCodec("another-secret");

test("session: roundtrip returns the user id", () => {
  const token = codec.sign(42, Date.now() + 60_000);
  assert.equal(codec.verify(token), 42);
});

test("session: tampered signature is rejected", () => {
  const token = codec.sign(42, Date.now() + 60_000);
  const parts = token.split(".");
  const badSig = parts[2].replace(/[A-Za-z0-9_-]/, (c) => (c === "A" ? "B" : "A"));
  assert.equal(codec.verify(`${parts[0]}.${parts[1]}.${badSig}`), null);
});

test("session: token signed with a different secret is rejected", () => {
  const token = otherCodec.sign(42, Date.now() + 60_000);
  assert.equal(codec.verify(token), null);
});

test("session: forged payload (valid id, no signature math) is rejected", () => {
  assert.equal(codec.verify("42.99999999999999.notarealsignature"), null);
  // structurally valid-looking token with a made-up userId
  const stolenSig = codec.sign(99, Date.now() + 60_000).split(".")[2];
  assert.equal(codec.verify(`1.${Date.now() + 60_000}.${stolenSig}`), null);
});

test("session: expired token is rejected", () => {
  const token = codec.sign(42, Date.now() - 1);
  assert.equal(codec.verify(token), null);
});

test("session: malformed tokens are rejected", () => {
  assert.equal(codec.verify(""), null);
  assert.equal(codec.verify("garbage"), null);
  assert.equal(codec.verify("1.2"), null);            // missing signature
  assert.equal(codec.verify("a.b.c.d"), null);        // extra segment
});

test("session: non-numeric expiry cannot be smuggled past verify", () => {
  const sig = codec.sign(1, 1).split(".")[2];
  assert.equal(codec.verify(`1.notanumber.${sig}`), null);
});
