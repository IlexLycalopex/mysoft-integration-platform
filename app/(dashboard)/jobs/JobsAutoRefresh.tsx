'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Silently refreshes the jobs page every 5 seconds while there are
 * active (pending or processing) jobs. Unmounts cleanly on navigation.
 */
export default function JobsAutoRefresh({ hasActiveJobs }: { hasActiveJobs: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveJobs) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasActiveJobs, router]);

  return null;
}
