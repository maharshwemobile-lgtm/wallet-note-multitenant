import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(null, async ({ user }) => {
  const [branches, moduleSetting] = await Promise.all([
    prisma.branch.findMany({
      where: {
        businessId: user.businessId,
        active: true,
        ...(user.allBranches ? {} : { id: { in: user.branchIds } }),
      },
      select: { id: true, name: true, code: true },
    }),
    prisma.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      select: { value: true },
    }),
  ]);

  let miniMartEnabled = true;
  if (moduleSetting) {
    try {
      miniMartEnabled = JSON.parse(moduleSetting.value).miniMartEnabled === true;
    } catch {
      miniMartEnabled = true;
    }
  }

  return json({ user, branches, modules: { miniMartEnabled } });
});
