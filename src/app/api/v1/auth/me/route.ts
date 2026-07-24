import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(null, async ({ user }) => {
  const branches = await prisma.branch.findMany({
    where: {
      businessId: user.businessId,
      active: true,
      ...(user.allBranches ? {} : { id: { in: user.branchIds } }),
    },
    select: { id: true, name: true, code: true },
  });
  return json({ user, branches });
});
