/**
 * Bulk User Import API
 * Import multiple users from CSV
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { logApiError, logInfo } from "@/lib/logger";

interface UserImportData {
  name: string;
  email: string;
  role: "ADMIN" | "STATION";
  stationId?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { users }: { users: UserImportData[] } = body;

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: "No users provided" }, { status: 400 });
    }

    // Validate all users before importing
    const validationErrors: string[] = [];
    const validUsers: UserImportData[] = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNum = i + 1;

      // Required fields
      if (!user.name || user.name.trim() === "") {
        validationErrors.push(`Row ${rowNum}: Name is required`);
        continue;
      }
      if (!user.email || user.email.trim() === "") {
        validationErrors.push(`Row ${rowNum}: Email is required`);
        continue;
      }
      if (!user.role || !["ADMIN", "STATION"].includes(user.role)) {
        validationErrors.push(`Row ${rowNum}: Role must be ADMIN or STATION`);
        continue;
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(user.email)) {
        validationErrors.push(`Row ${rowNum}: Invalid email format`);
        continue;
      }

      // Station user must have stationId
      if (user.role === "STATION" && !user.stationId) {
        validationErrors.push(`Row ${rowNum}: Station users must have stationId`);
        continue;
      }

      // Check for duplicate emails in the import batch
      const duplicateInBatch = validUsers.find((u) => u.email === user.email);
      if (duplicateInBatch) {
        validationErrors.push(`Row ${rowNum}: Duplicate email in import batch`);
        continue;
      }

      // Check if email already exists in database
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });
      if (existingUser) {
        validationErrors.push(`Row ${rowNum}: Email already exists in database`);
        continue;
      }

      // Validate stationId if provided
      if (user.stationId) {
        const station = await prisma.station.findUnique({
          where: { id: user.stationId },
        });
        if (!station) {
          validationErrors.push(`Row ${rowNum}: Station ID not found`);
          continue;
        }
      }

      validUsers.push(user);
    }

    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed",
          errors: validationErrors,
          validCount: validUsers.length,
          totalCount: users.length,
        },
        { status: 400 }
      );
    }

    // Import all valid users
    const importedUsers = [];
    const errors = [];

    for (const user of validUsers) {
      try {
        // Generate default password if not provided
        const password = user.password || `temp${Math.random().toString(36).slice(2, 10)}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
          data: {
            name: user.name.trim(),
            email: user.email.trim().toLowerCase(),
            passwordHash: hashedPassword,
            role: user.role,
            stationId: user.stationId || null,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            stationId: true,
          },
        });

        importedUsers.push({
          ...newUser,
          defaultPassword: user.password ? undefined : password,
        });
      } catch (error: any) {
        errors.push({
          email: user.email,
          error: error.message || "Failed to create user",
        });
      }
    }

    logInfo("Bulk user import completed", {
      userId: payload.userId,
      imported: importedUsers.length,
      failed: errors.length,
      total: users.length,
    });

    return NextResponse.json({
      success: true,
      imported: importedUsers,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: users.length,
        imported: importedUsers.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    logApiError("/api/admin/users/import", error as Error);
    return NextResponse.json(
      { error: "Failed to import users" },
      { status: 500 }
    );
  }
}
