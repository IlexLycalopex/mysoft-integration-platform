import { NextResponse } from 'next/server';

/**
 * Validates the CRON_SECRET bearer token for internal cron endpoints.
 *
 * Returns a NextResponse to short-circuit the handler if auth fails, or
 * null if the request is authorised and processing should continue.
 *
 * Behaviour:
 *   - Production, CRON_SECRET not set → 500 (server misconfiguration)
 *   - CRON_SECRET set, wrong/missing token → 401
 *   - Development, CRON_SECRET not set → null (allow unauthenticated for local testing)
 *
 * Usage:
 *   const authError = verifyCronSecret(req);
 *   if (authError) return authError;
 */
export function verifyCronSecret(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    // Development: allow unauthenticated access for local testing
    return null;
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
