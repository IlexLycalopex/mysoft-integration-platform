import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/api-auth';
import { validateFile } from '@/lib/intacct/validator';
import type { ColumnMappingEntry, UserRole } from '@/types/database';

export async function POST(req: NextRequest) {
  let tenantId: string | null = null;

  // 1. Try API key first
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer mip_')) {
    const ctx = await validateApiKey(authHeader);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    tenantId = ctx.tenantId;
  } else {
    // 2. Fall back to session auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single<{ role: UserRole; tenant_id: string | null }>();

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const allowedRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    tenantId = profile.tenant_id;
  }

  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });

  // 3. Parse form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const filename = formData.get('filename') as string | null;
  const mappingId = formData.get('mappingId') as string | null;

  if (!file || !filename || !mappingId) {
    return NextResponse.json({ error: 'file, filename, and mappingId are required' }, { status: 400 });
  }

  // 4. Fetch mapping (check tenant ownership)
  const admin = createAdminClient();
  const { data: mapping, error: mappingError } = await admin
    .from('field_mappings')
    .select('column_mappings, transaction_type')
    .eq('id', mappingId)
    .single<{ column_mappings: ColumnMappingEntry[]; transaction_type: string }>();

  if (mappingError || !mapping) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
  }

  // Verify mapping belongs to this tenant (or is a platform template with null tenant_id)
  const { data: mappingWithTenant } = await admin
    .from('field_mappings')
    .select('tenant_id, is_template')
    .eq('id', mappingId)
    .single<{ tenant_id: string | null; is_template: boolean }>();

  if (
    mappingWithTenant &&
    mappingWithTenant.tenant_id !== null &&
    mappingWithTenant.tenant_id !== tenantId
  ) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
  }

  // 5. Run validation
  const result = await validateFile(file, filename, mapping.column_mappings, mapping.transaction_type);

  return NextResponse.json(result);
}
