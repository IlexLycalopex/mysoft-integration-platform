import { cookies } from 'next/headers';

export const EMULATION_COOKIE = 'mip-emulation';

/** 1-hour max session */
const TIMEOUT_MS = 60 * 60 * 1000;

export interface EmulationContext {
  tenant_id: string;
  user_id: string;       // ID of the user being emulated
  user_name: string;     // Display name
  user_role: string;     // Their role in the tenant
  tenant_name: string;
  started_at: string;    // ISO timestamp
  started_by: string;    // Platform admin user ID
}

/**
 * Returns the active emulation context, or null if none / expired.
 * Safe to call on every server request — reads a single httpOnly cookie.
 */
export async function getEmulationContext(): Promise<EmulationContext | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(EMULATION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const ctx = JSON.parse(raw) as EmulationContext;
    const elapsed = Date.now() - new Date(ctx.started_at).getTime();
    if (elapsed > TIMEOUT_MS) return null;
    return ctx;
  } catch {
    return null;
  }
}

/** Returns minutes remaining in the emulation session (0 if expired). */
export function emulationMinutesLeft(startedAt: string): number {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return Math.max(0, Math.floor((TIMEOUT_MS - elapsed) / 60000));
}
