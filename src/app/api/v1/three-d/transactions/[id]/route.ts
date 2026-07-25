import { withAuth, json, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const DELETE = withAuth("three_d.delete", async ({ user, params }) => {
  const txn = await prisma.threeDTransaction.findUnique({ where: { id: params.id } });
  if (!txn || txn.businessId !== user.businessId || txn.deletedAt)
    throw new ApiError(404, "Record not found");
  if (txn.settlementStatus === "SETTLED")
    throw new ApiError(422, "Settled records cannot be deleted. Reopen the settlement first.");

  await prisma.$transaction(async (tx) => {
    await tx.threeDTransaction.update({
      where: { id: txn.id },
      data: {
        deletedAt: new Date(),
        settlementStatus: "CANCELLED",
        commissionRate: "0",
        commissionAmount: 0n,
        netAmount: 0n,
      },
    });
    await audit(tx, {
      businessId: user.businessId, userId: user.id, branchId: txn.branchId,
      action: "DELETE", module: "three_d", resourceType: "ThreeDTransaction", resourceId: txn.id,
      before: {
        txnNo: txn.txnNo,
        number: txn.number,
        betAmount: txn.betAmount,
        commissionRate: txn.commissionRate,
        commissionAmount: txn.commissionAmount,
        netAmount: txn.netAmount,
      },
      after: { settlementStatus: "CANCELLED", commissionAmount: 0n, netAmount: 0n },
    });
  });
  return json({ deleted: true });
});
