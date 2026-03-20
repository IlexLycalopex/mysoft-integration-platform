'use server';

import { createAdminClient } from '@/lib/supabase/admin';

interface AuditEntry {
  userId: string;
  tenantId?: string | null;
  operation: string;
  resourceType?: string;
  resourceId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry) {
  try {
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      user_id: entry.userId,
      tenant_id: entry.tenantId ?? null,
      operation: entry.operation,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
    });
  } catch {
    // Audit log failures must never break the main flow
  }
}
