import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";

export const GET = withAuth("income_expense.view", async ({ req, user }) => {
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const categories = await prisma.category.findMany({
    where: { businessId: user.businessId, active: true, ...(type ? { type } : {}) },
    orderBy: { name: "asc" },
  });
  return json(categories);
});

const schema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  name: z.string().trim().min(1).max(80),
});

export const POST = withAuth(null, async ({ req, user }) => {
  if (!can(user, "income_expense.create") && !can(user, "settings.manage")) {
    throw new ApiError(403, "You do not have permission to add categories");
  }
  const body = await parseBody(req, schema);
  const category = await prisma.category.upsert({
    where: { businessId_type_name: { businessId: user.businessId, type: body.type, name: body.name } },
    create: { businessId: user.businessId, type: body.type, name: body.name },
    update: { active: true },
  });
  return json(category, { status: 201 });
});
