-- Multi-tenancy: Add Organization model and link to existing models
-- All organizationId columns are nullable for backward compatibility

-- Create organizations table
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_stations" INTEGER NOT NULL DEFAULT 5,
    "max_machines" INTEGER NOT NULL DEFAULT 20,
    "max_users_per_org" INTEGER NOT NULL DEFAULT 10,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Unique index on slug for subdomain routing
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Add organization_id to users
ALTER TABLE "users" ADD COLUMN "organization_id" TEXT;

-- Add organization_id to stations
ALTER TABLE "stations" ADD COLUMN "organization_id" TEXT;

-- Add organization_id to vouchers
ALTER TABLE "vouchers" ADD COLUMN "organization_id" TEXT;

-- Add organization_id to machines
ALTER TABLE "machines" ADD COLUMN "organization_id" TEXT;

-- Add organization_id to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" TEXT;

-- Add foreign key constraints
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stations" ADD CONSTRAINT "stations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "machines" ADD CONSTRAINT "machines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes for organization-scoped queries
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "stations_organization_id_idx" ON "stations"("organization_id");
CREATE INDEX "vouchers_organization_id_idx" ON "vouchers"("organization_id");
CREATE INDEX "machines_organization_id_idx" ON "machines"("organization_id");
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
