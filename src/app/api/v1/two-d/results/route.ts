import { json, withAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Official 2D results, newest first.
 *
 *  Read-only reference data shared by every tenant — the same numbers for everyone — so
 *  it is gated on being signed in rather than on a per-business permission.
 */
export const GET = withAuth(null, async ({ req }) => {
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100);
  const drawDate = req.nextUrl.searchParams.get("date")?.trim();

  const results = await prisma.twoDOfficialResult.findMany({
    where: drawDate ? { drawDate } : undefined,
    orderBy: [{ drawDate: "desc" }, { drawTime: "desc" }],
    take: limit,
    select: {
      drawDate: true, sessionName: true, drawTime: true,
      resultNumber: true, setValue: true, value: true,
      source: true, fetchedAt: true,
    },
  });

  return json(results);
});
