// Change a user's role. Usage:
//   node scripts/make-admin.mjs user@example.com            # → owner
//   node scripts/make-admin.mjs user@example.com owner      # → owner
//   node scripts/make-admin.mjs user@example.com counter    # → counter_operator
//   node scripts/make-admin.mjs user@example.com demote     # → passenger
// The account must exist (register in the app first).
import { pool, q, ensureSchema } from "../src/db.js";

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const arg = String(process.argv[3] || "owner").trim().toLowerCase();
  const role =
    arg === "demote" || arg === "passenger" ? "passenger"
    : arg === "counter" || arg === "counter_operator" || arg === "operator" ? "counter_operator"
    : "owner";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage: node scripts/make-admin.mjs <email> [owner|counter|demote]");
    process.exit(1);
  }
  await ensureSchema();
  const { rows } = await q("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
  if (!rows[0]) {
    console.error(`No account found for ${email} — register in the app first.`);
    process.exit(1);
  }
  await q("UPDATE users SET role = $1 WHERE id = $2", [role, rows[0].id]);
  console.log(`${rows[0].name} <${rows[0].email}> is now ${role}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to update role:", err.message);
  process.exit(1);
});
