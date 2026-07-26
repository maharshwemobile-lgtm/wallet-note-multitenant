// One-off: add wallet.withdraw to existing tenants' roles across the whole
// database. New tenants get it automatically via DEFAULT_ROLES at
// registration; this backfills businesses that registered before this
// permission existed. Run once after deploying the migration.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ADD_TO = ["Owner", "Admin", "Cashier", "Accountant"];
async function main() {
  const roles = await p.role.findMany({ where: { name: { in: ADD_TO } } });
  for (const r of roles) {
    const cur: string[] = JSON.parse(r.permissions);
    if (!cur.includes("wallet.withdraw")) {
      await p.role.update({ where: { id: r.id }, data: { permissions: JSON.stringify([...cur, "wallet.withdraw"]) } });
      console.log(r.businessId, r.name, "+ wallet.withdraw");
    }
  }
}
main().then(() => process.exit(0));
