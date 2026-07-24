import { withAuth, json, pagination, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canAccessBranch } from "@/lib/auth";

export const GET = withAuth("wallet.view", async ({ req, user, params }) => {
  const wallet = await prisma.wallet.findUnique({ where: { id: params.id } });
  if (!wallet || wallet.businessId !== user.businessId) throw new ApiError(404, "Wallet not found");
  if (wallet.branchId && !canAccessBranch(user, wallet.branchId))
    throw new ApiError(403, "No access to this branch");

  const { skip, take, page, pageSize } = pagination(req, 50);
  const [entries, total] = await Promise.all([
    prisma.walletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.walletLedgerEntry.count({ where: { walletId: wallet.id } }),
  ]);
  return json({ wallet, entries, total, page, pageSize });
});
