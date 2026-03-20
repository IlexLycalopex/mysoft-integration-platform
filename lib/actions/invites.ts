'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import { sendInviteEmail } from '@/lib/email';
import type { UserRole } from '@/types/database';

export type InviteFormState = { error?: string; success?: boolean };
export type AcceptFormState = { error?: string; success?: boolean };

export async function createInvite(
  _prev: InviteFormState,
  formData: FormData
): Promise<InviteFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const profile = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile.data?.tenant_id) return { error: 'No tenant associated with your account' };

  const allowedRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!allowedRoles.includes(profile.data.role)) {
    return { error: 'You do not have permission to invite users' };
  }

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const role = formData.get('role') as UserRole;

  if (!email) return { error: 'Email address is required' };
  if (!role) return { error: 'Role is required' };

  const admin = createAdminClient();

  // Check for existing active invite
  const { data: existing } = await admin
    .from('user_invites')
    .select('id')
    .eq('tenant_id', profile.data.tenant_id)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) return { error: 'An active invite already exists for this email address' };

  const { data: invite, error } = await admin
    .from('user_invites')
    .insert({
      tenant_id: profile.data.tenant_id,
      email,
      role,
      invited_by: user.id,
    })
    .select('token')
    .single<{ token: string }>();

  if (error) return { error: error.message };

  // Send invite email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  await sendInviteEmail({ to: email, token: invite.token, inviterEmail: user.email ?? '', baseUrl });

  await logAudit({
    userId: user.id,
    tenantId: profile.data.tenant_id,
    operation: 'create_invite',
    resourceType: 'user_invite',
    newValues: { email, role },
  });

  revalidatePath('/settings/users');
  return { success: true };
}

export type PlatformInviteState = { error?: string; success?: boolean };

export async function platformInviteUser(
  tenantId: string,
  _prev: PlatformInviteState,
  formData: FormData
): Promise<PlatformInviteState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: myProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(myProfile?.role ?? '')) {
    return { error: 'Platform admin access required' };
  }

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const role = (formData.get('role') as UserRole) ?? 'tenant_admin';

  if (!email) return { error: 'Email address is required' };

  const admin = createAdminClient();

  // Check for existing active invite
  const { data: existing } = await admin
    .from('user_invites')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) return { error: 'An active invite already exists for this email address' };

  const { data: invite, error } = await admin
    .from('user_invites')
    .insert({ tenant_id: tenantId, email, role, invited_by: user.id })
    .select('token')
    .single<{ token: string }>();

  if (error) return { error: error.message };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  try {
    await sendInviteEmail({ to: email, token: invite.token, inviterEmail: user.email ?? '', baseUrl });
  } catch {
    // Don't fail the whole operation if email fails
  }

  await logAudit({
    userId: user.id,
    tenantId,
    operation: 'create_invite',
    resourceType: 'user_invite',
    newValues: { email, role, invited_by_platform: true },
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}

export async function acceptInvite(
  token: string,
  _prev: AcceptFormState,
  formData: FormData
): Promise<AcceptFormState> {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' };
  if (password !== confirmPassword) return { error: 'Passwords do not match' };

  const admin = createAdminClient();

  // Validate token
  const { data: invite } = await admin
    .from('user_invites')
    .select('id, email, role, tenant_id, accepted_at, expires_at')
    .eq('token', token)
    .single<{
      id: string;
      email: string;
      role: UserRole;
      tenant_id: string;
      accepted_at: string | null;
      expires_at: string;
    }>();

  if (!invite) return { error: 'Invalid or expired invitation link' };
  if (invite.accepted_at) return { error: 'This invitation has already been used' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired' };

  // Create Supabase auth user
  const { data: authUser, error: signUpError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });

  if (signUpError) {
    if (signUpError.message.includes('already registered')) {
      return { error: 'An account with this email already exists. Please sign in.' };
    }
    return { error: signUpError.message };
  }

  // Create user profile
  const { error: profileError } = await admin.from('user_profiles').insert({
    id: authUser.user.id,
    tenant_id: invite.tenant_id,
    role: invite.role,
  });

  if (profileError) return { error: profileError.message };

  // Mark invite as accepted
  await admin
    .from('user_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  await logAudit({
    userId: authUser.user.id,
    tenantId: invite.tenant_id,
    operation: 'accept_invite',
    resourceType: 'user_profile',
    resourceId: authUser.user.id,
    newValues: { email: invite.email, role: invite.role },
  });

  return { success: true };
}
