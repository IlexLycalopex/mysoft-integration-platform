'use server';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export type SftpTestState = { error?: string; success?: boolean };

export async function testSftpConnection(
  _prev: SftpTestState,
  formData: FormData
): Promise<SftpTestState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) {
    return { error: 'You do not have permission to test SFTP connections' };
  }

  const host     = (formData.get('sftp_host')        as string | null)?.trim();
  const portRaw  =  formData.get('sftp_port')         as string | null;
  const username = (formData.get('sftp_username')     as string | null)?.trim();
  const password =  formData.get('sftp_password')     as string | null;
  const remotePath = (formData.get('sftp_remote_path') as string | null)?.trim();

  if (!host)     return { error: 'SFTP host is required' };
  if (!username) return { error: 'SFTP username is required' };
  if (!password) return { error: 'SFTP password is required to test — enter it before testing' };

  const port = portRaw ? parseInt(portRaw, 10) : 22;

  // Dynamically import to keep the module out of the client bundle
  const SftpClient = (await import('ssh2-sftp-client')).default;
  const sftp = new SftpClient();

  try {
    await sftp.connect({ host, port, username, password, readyTimeout: 8000 });
    // Attempt to list the remote path (or root if not provided) to confirm access
    const pathToTest = remotePath || '/';
    await sftp.list(pathToTest);
    await sftp.end();
    return { success: true };
  } catch (err: unknown) {
    try { await sftp.end(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    // Friendly messages for common SFTP errors
    if (msg.includes('Authentication') || msg.includes('authentication')) {
      return { error: 'Authentication failed — check username and password.' };
    }
    if (msg.includes('ECONNREFUSED')) {
      return { error: `Connection refused on ${host}:${port} — check the host and port.` };
    }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return { error: `Cannot resolve host "${host}" — check the hostname.` };
    }
    if (msg.includes('No such file') || msg.includes('ENOENT')) {
      return { error: `Connected successfully but remote path "${remotePath}" does not exist.` };
    }
    return { error: msg };
  }
}
