import { withAuth, json, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withAuth("three_d.view", async ({ req }) => {
  const { skip, take, page, pageSize } = pagination(req);
  const [results, total] = await Promise.all([
    prisma.threeDOfficialResult.findMany({
      orderBy: [{ drawDate: "desc" }, { drawTime: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true, drawDate: true, drawTime: true, sessionName: true,
        resultNumber: true, source: true, fetchedAt: true,
      },
    }),
    prisma.threeDOfficialResult.count(),
  ]);
  return json({ results, total, page, pageSize });
});
