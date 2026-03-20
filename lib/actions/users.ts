'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import { sendPasswordResetEmail } from '@/lib/email';
import type { UserRole } from '@/types/database';

export type UserActionState = { error?: string; success?: boolean };

export async function updateUserRole(
  targetUserId: string,
  newRole: UserRole,
): Promise<UserActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: myProfile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const platformRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin'];
  const isAdmin = myProfile?.role === 'tenant_admin' || platformRoles.includes(myProfile?.role as UserRole);
  if (!isAdmin) return { error: 'Insufficient permissions' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ role: newRole })
    .eq('id', targetUserId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: myProfile?.tenant_id,
    operation: 'update_user_role',
    resourceType: 'user_profile',
    resourceId: targetUserId,
    newValues: { role: newRole },
  });

  revalidatePath('/settings/users');
  revalidatePath('/platform/users');
  return { success: true };
}

export async function sendPasswordReset(targetUserId: string): Promise<UserActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: myProfile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const platformRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin'];
  const isAdmin = myProfile?.role === 'tenant_admin' || platformRoles.includes(myProfile?.role as UserRole);
  if (!isAdmin) return { error: 'Insufficient permissions' };

  const admin = createAdminClient();

  // Fetch the target user's email
  const { data: authUser, error: fetchErr } = await admin.auth.admin.getUserById(targetUserId);
  if (fetchErr || !authUser.user.email) return { error: 'User not found' };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  // Generate a recovery link via the admin API
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: authUser.user.email,
    options: { redirectTo: `${baseUrl}/api/auth/callback?next=/reset-password` },
  });

  if (linkErr || !linkData.properties?.action_link) {
    return { error: linkErr?.message ?? 'Failed to generate reset link' };
  }

  try {
    await sendPasswordResetEmail({ to: authUser.user.email, resetUrl: linkData.properties.action_link });
  } catch {
    return { error: 'Failed to send reset email. Please try again.' };
  }

  await logAudit({
    userId: user.id,
    tenantId: myProfile?.tenant_id,
    operation: 'send_password_reset',
    resourceType: 'user_profile',
    resourceId: targetUserId,
    newValues: { email: authUser.user.email },
  });

  return { success: true };
}

export async function deactivateUser(targetUserId: string): Promise<UserActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (targetUserId === user.id) return { error: 'You cannot deactivate your own account' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ is_active: false })
    .eq('id', targetUserId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    operation: 'deactivate_user',
    resourceType: 'user_profile',
    resourceId: targetUserId,
  });

  revalidatePath('/settings/users');
  revalidatePath('/platform/users');
  return { success: true };
}
