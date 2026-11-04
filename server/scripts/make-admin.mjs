// Grant or revoke the admin role on a registered account.
//   node scripts/make-admin.mjs user@example.com        # promote
//   node scripts/make-admin.mjs user@example.com demote # back to passenger
// The account must exist (register in the app first).
import { pool, q, ensureSchema } from "../src/db.js";

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const demote = process.argv[3] === "demote";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage: node scripts/make-admin.mjs <email> [demote]");
    process.exit(1);
  }
  await ensureSchema();
  const { rows } = await q("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
  if (!rows[0]) {
    console.error(`No account found for ${email} — register in the app first.`);
    process.exit(1);
  }
  const role = demote ? "passenger" : "admin";
  await q("UPDATE users SET role = $1 WHERE id = $2", [role, rows[0].id]);
  console.log(`${rows[0].name} <${rows[0].email}> is now ${role}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to update role:", err.message);
  process.exit(1);
});
