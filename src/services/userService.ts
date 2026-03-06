/**
 * User Service
 * CRUD operations for managing admin and station users.
 */

import prisma from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth";
import type { UserRole } from "@/types";

export async function getUsers(params: {
  page?: number;
  pageSize?: number;
  role?: string;
  search?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};
  if (params.role && params.role !== "ALL") {
    where.role = params.role;
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { email: { contains: params.search } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { station: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      stationId: u.stationId,
      stationName: u.station?.stationName || null,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  stationId?: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      stationId: data.stationId || null,
    },
    include: { station: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    stationId: user.stationId,
    stationName: (user as any).station?.stationName || null,
  };
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; role?: UserRole; stationId?: string | null }
) {
  if (data.email) {
    const existing = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id } },
    });
    if (existing) throw new Error("Another user with this email already exists");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.email && { email: data.email }),
      ...(data.role && { role: data.role }),
      ...(data.stationId !== undefined && { stationId: data.stationId || null }),
    },
    include: { station: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    stationId: user.stationId,
    stationName: (user as any).station?.stationName || null,
  };
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}

export async function resetUserPassword(id: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const { comparePassword } = await import("@/lib/auth");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}
