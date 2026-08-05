import { z } from "zod";
import { withAuth, json, parseBody, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { createRepairJob, REPAIR_STATUSES } from "@/services/repairService";

export const GET = withAuth("repair.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const q = sp.get("q")?.trim();
  const status = sp.get("status");

  const where = {
    businessId: user.businessId,
    deletedAt: null,
    ...branchScope(user),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { jobNo: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q } },
            { deviceBrand: { contains: q, mode: "insensitive" as const } },
            { deviceModel: { contains: q, mode: "insensitive" as const } },
            { imei: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [jobs, total, openJobs] = await Promise.all([
    prisma.repairJob.findMany({ where, orderBy: { receivedAt: "desc" }, skip, take }),
    prisma.repairJob.count({ where }),
    // What is still on the bench, which is the number a counter actually watches.
    prisma.repairJob.count({
      where: {
        businessId: user.businessId,
        deletedAt: null,
        ...branchScope(user),
        status: { in: ["RECEIVED", "IN_PROGRESS", "WAITING_PARTS", "DONE"] },
      },
    }),
  ]);

  return json({ jobs, total, page, pageSize, openJobs });
});

const createSchema = z.object({
  branchId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  deviceBrand: z.string().trim().min(1).max(60),
  deviceModel: z.string().trim().min(1).max(80),
  imei: z.string().trim().max(40).optional(),
  accessories: z.string().trim().max(300).optional(),
  problem: z.string().trim().min(1).max(500),
  estimatedCost: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  depositAmount: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  depositWalletId: z.string().optional(),
  technicianId: z.string().optional(),
  promisedAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const POST = withAuth("repair.create", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);
  const branchId = body.branchId ?? user.branchIds[0];
  if (!branchId) throw new Error("No branch is available for your account");
  await assertBranchAccess(user, branchId);

  const job = await prisma.$transaction((tx) =>
    createRepairJob(tx, {
      businessId: user.businessId,
      branchId,
      userId: user.id,
      customerId: body.customerId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      deviceBrand: body.deviceBrand,
      deviceModel: body.deviceModel,
      imei: body.imei,
      accessories: body.accessories,
      problem: body.problem,
      estimatedCost: toMinor(body.estimatedCost),
      depositAmount: toMinor(body.depositAmount),
      depositWalletId: body.depositWalletId,
      technicianId: body.technicianId,
      promisedAt: body.promisedAt ? new Date(body.promisedAt) : undefined,
      notes: body.notes,
    })
  );

  return json(job, { status: 201 });
});

export const REPAIR_STATUS_VALUES = REPAIR_STATUSES;
