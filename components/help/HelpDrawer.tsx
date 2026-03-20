'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tip {
  title: string;
  description: string;
  href: string;
}

function getTipsForPath(path: string): Tip[] {
  if (path.startsWith('/dashboard')) {
    return [
      {
        title: 'Quick start guide',
        description: 'Follow the 6-step setup checklist to get your workspace configured and ready to submit data to Intacct.',
        href: '/help/getting-started',
      },
      {
        title: 'Check credential status',
        description: 'Make sure your Sage Intacct credentials are configured and the Web Services Sender ID is authorized.',
        href: '/help/intacct-setup',
      },
      {
        title: 'Your first upload',
        description: 'Upload a CSV file, choose a field mapping, and optionally enable Auto-process to submit directly to Intacct.',
        href: '/help/uploading-files',
      },
    ];
  }

  if (path.startsWith('/uploads')) {
    return [
      {
        title: 'Supported file formats',
        description: 'Upload CSV, .xlsx, or .xls files. Headers must be in row 1. UTF-8 or Windows-1252 encoding supported.',
        href: '/help/uploading-files',
      },
      {
        title: 'Row quota preview',
        description: 'After your file is validated the platform shows how many rows it contains and projects your monthly quota usage. A red warning means this upload would exceed your plan limit.',
        href: '/help/uploading-files',
      },
      {
        title: 'How Auto-process works',
        description: 'Enable Auto-process to have the file submitted to Intacct automatically after upload — no manual trigger needed.',
        href: '/help/uploading-files',
      },
      {
        title: 'CSV format guide',
        description: 'Check the column reference for all 7 transaction types: Journal Entry, AR Invoice, AP Bill, Expense Report, and more.',
        href: '/help/csv-format',
      },
      {
        title: 'Duplicate file detection',
        description: 'Files are hashed on upload. Uploading the same file twice will be rejected to prevent double-posting.',
        href: '/help/uploading-files',
      },
    ];
  }

  if (path.startsWith('/jobs')) {
    return [
      {
        title: 'Job status meanings',
        description: 'Understand what pending, processing, completed, completed_with_errors, failed, and cancelled statuses mean.',
        href: '/help/job-history',
      },
      {
        title: 'Retry vs Re-process',
        description: 'Retry resets the existing job (only on failed jobs). Re-process creates a brand-new job from the same file (available on any finished job). They are not interchangeable.',
        href: '/help/job-history',
      },
      {
        title: 'View the processing log',
        description: 'Expand log entries to see the raw Intacct request/response XML and error details including the correction hint.',
        href: '/help/job-history',
      },
      {
        title: 'RECORDNO in Intacct',
        description: 'Intacct returns a RECORDNO for each accepted transaction. Find it in the processing log or job summary.',
        href: '/help/job-history',
      },
    ];
  }

  if (path.startsWith('/mappings')) {
    return [
      {
        title: 'About field mappings',
        description: 'Field mappings tell the platform how to translate your CSV columns into Intacct fields.',
        href: '/help/csv-format',
      },
      {
        title: 'Using standard templates',
        description: 'Clone one of the 7 built-in templates (Journal Entry, Payroll, AR Invoice, AP Bill, Expense Report, AR/AP Payment) as a starting point.',
        href: '/help/getting-started',
      },
      {
        title: 'Custom column mappings',
        description: 'Map any source column name to the expected target field. Apply transforms like date formatting, decimal parsing, and trimming.',
        href: '/help/csv-format',
      },
    ];
  }

  if (path.startsWith('/errors')) {
    return [
      {
        title: 'Fixing row errors',
        description: 'Each error row shows the Intacct error code and correction hint. Fix the source data and resubmit.',
        href: '/help/troubleshooting',
      },
      {
        title: 'Common error codes',
        description: 'XL03000006 (unauthorized sender), BL03000018 (missing location), and more — with step-by-step fixes.',
        href: '/help/troubleshooting',
      },
      {
        title: 'Reading the processing log',
        description: 'Expand log entries to see the raw XML response from Intacct, including the correction field.',
        href: '/help/job-history',
      },
    ];
  }

  if (path.startsWith('/settings')) {
    return [
      {
        title: 'Test before you save',
        description: 'Use ⚡ Test Connection on the Integrations page to verify Intacct credentials before saving. For SFTP watchers, use ⚡ Test SFTP Connection in Step 2 of the watcher form.',
        href: '/help/intacct-setup',
      },
      {
        title: 'Intacct credentials setup',
        description: 'Enter your Company ID, Web Services user, Sender ID, and optionally an Entity ID for multi-entity companies.',
        href: '/help/intacct-setup',
      },
      {
        title: 'Watcher execution log',
        description: 'Expand any watcher in Settings → Watchers to see when it last ran, how many files were ingested, skipped (duplicate), or rejected.',
        href: '/help/automated-ingestion',
      },
      {
        title: 'HTTP push token security',
        description: 'Push tokens are hidden by default. Click reveal to show the full URL. Treat the token like a password — anyone with the URL can deliver files to your watcher.',
        href: '/help/automated-ingestion',
      },
      {
        title: 'Creating API keys',
        description: 'Generate API keys for the Windows Agent or direct API push. Keys are shown once — store them securely.',
        href: '/help/automated-ingestion',
      },
    ];
  }

  // Default / catch-all tips
  return [
    {
      title: 'Getting started',
      description: 'Follow the 6-step setup checklist to configure your workspace.',
      href: '/help/getting-started',
    },
    {
      title: 'Uploading files',
      description: 'Upload CSV or Excel files and submit them to Intacct with a field mapping.',
      href: '/help/uploading-files',
    },
    {
      title: 'CSV format reference',
      description: 'Column definitions for all 7 transaction types plus accepted date formats.',
      href: '/help/csv-format',
    },
    {
      title: 'Troubleshooting',
      description: 'Common Intacct error codes and how to fix them.',
      href: '/help/troubleshooting',
    },
    {
      title: 'Roles & Permissions',
      description: 'See what each role can access across the platform.',
      href: '/help/roles-permissions',
    },
  ];
}

export default function HelpDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const tips = getTipsForPath(pathname ?? '');

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setOpen(false);
  };

  return (
    <>
      {/* Floating ? button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open help"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: open ? '#0B1929' : '#00A3E0',
          color: '#fff',
          border: 'none',
          fontSize: 18,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          transition: 'background 0.2s, transform 0.2s',
          transform: open ? 'scale(0.92)' : 'scale(1)',
          lineHeight: 1,
        }}
      >
        {open ? '✕' : '?'}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={handleBackdrop}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            background: 'rgba(0,0,0,0.15)',
          }}
        />
      )}

      {/* Slide-in drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 1051,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#0B1929',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Quick Help</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Tips for this page
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tips list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tips.map((tip) => (
              <div
                key={tip.href + tip.title}
                style={{
                  background: '#f7f9fb',
                  border: '1px solid #e8eaed',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 5 }}>
                  {tip.title}
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.55, margin: '0 0 10px' }}>
                  {tip.description}
                </p>
                <Link
                  href={tip.href}
                  onClick={() => setOpen(false)}
                  style={{
                    fontSize: 12,
                    color: '#00A3E0',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  Learn more →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Footer link to full help centre */}
        <div
          style={{
            borderTop: '1px solid #e8eaed',
            padding: '14px 20px',
            flexShrink: 0,
          }}
        >
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: '#0B1929',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            Open full Help Centre →
          </Link>
        </div>
      </div>
    </>
  );
}
