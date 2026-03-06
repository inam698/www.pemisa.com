/**
 * Audit Service
 * Logs all significant actions in the system for traceability.
 */

import prisma from "@/lib/db/prisma";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "UPLOAD_CSV"
  | "GENERATE_VOUCHERS"
  | "REDEEM"
  | "VERIFY"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "CREATE_STATION"
  | "UPDATE_STATION"
  | "DELETE_STATION"
  | "REVOKE_BATCH"
  | "RESEND_SMS"
  | "CHANGE_PASSWORD"
  | "RESET_PASSWORD"
  | "EXPORT_REPORT";

interface AuditLogInput {
  action: AuditAction;
  actor: string;
  actorRole: string;
  target?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Creates an audit log entry.
 */
export async function logAudit(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actor: input.actor,
        actorRole: input.actorRole,
        target: input.target || null,
        details: input.details ? JSON.stringify(input.details) : null,
        ipAddress: input.ipAddress || null,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Non-blocking — don't throw
  }
}

/**
 * Fetches paginated audit logs with optional filters.
 */
export async function getAuditLogs(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};

  if (params.action && params.action !== "ALL") {
    where.action = params.action;
  }
  if (params.actor) {
    where.actor = { contains: params.actor };
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) (where.createdAt as Record<string, unknown>).gte = new Date(params.from);
    if (params.to) (where.createdAt as Record<string, unknown>).lte = new Date(params.to);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs.map((l: any) => ({
      id: l.id,
      action: l.action,
      actor: l.actor,
      actorRole: l.actorRole,
      target: l.target,
      details: l.details ? JSON.parse(l.details) : null,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
