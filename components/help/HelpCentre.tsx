'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { UserRole } from '@/types/database';

interface HelpCentreProps {
  role: UserRole;
  hasCredentials: boolean;
  hasMapping: boolean;
  hasJob: boolean;
  initialSection?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  platformAdminOnly?: boolean;
  badge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'getting-started',    label: 'Getting Started',      icon: '⚡', adminOnly: true },
  { id: 'uploading-files',    label: 'Uploading Files',       icon: '📤' },
  { id: 'job-history',        label: 'Job History & Logs',    icon: '📋' },
  { id: 'automated-ingestion',label: 'Automated Ingestion',   icon: '🔄' },
  { id: 'csv-format',         label: 'CSV Format Reference',  icon: '📊' },
  { id: 'intacct-setup',      label: 'Intacct Setup',         icon: '🔧' },
  { id: 'troubleshooting',    label: 'Troubleshooting',       icon: '🛠' },
  { id: 'roles-permissions',  label: 'Roles & Permissions',   icon: '🔒' },
  { id: 'approval-workflow',  label: 'Approval Workflow',      icon: '✅' },
  { id: 'usage-plans',        label: 'Usage & Plans',          icon: '📈' },
  { id: 'new-formats',        label: 'New Data Formats',       icon: '📁' },
  { id: 'developer',          label: 'Developer & API',        icon: '⚙️', adminOnly: true },
  { id: 'platform-admin',     label: 'Platform Administration', icon: '⚙️', platformAdminOnly: true },
];

// ── Shared style helpers ────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e8eaed',
  padding: 24,
  marginBottom: 32,
};

const sectionHeading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#0B1929',
  marginBottom: 8,
  marginTop: 0,
};

const subHeading: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#111',
  marginBottom: 12,
  marginTop: 24,
};

const bodyText: React.CSSProperties = {
  fontSize: 14,
  color: '#374151',
  lineHeight: 1.6,
  marginBottom: 8,
};

const codeBlock: React.CSSProperties = {
  background: '#f4f6f8',
  borderRadius: 6,
  padding: '12px 16px',
  fontFamily: 'monospace',
  fontSize: 13,
  color: '#1a1a2e',
  overflowX: 'auto',
  marginBottom: 12,
};

const callout: React.CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #f59e0b',
  borderRadius: 6,
  padding: '12px 16px',
  fontSize: 14,
  color: '#78350f',
  marginBottom: 16,
};

const infoBox: React.CSSProperties = {
  background: '#eff6ff',
  border: '1px solid #3b82f6',
  borderRadius: 6,
  padding: '12px 16px',
  fontSize: 14,
  color: '#1e3a8a',
  marginBottom: 16,
};

const successBox: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #22c55e',
  borderRadius: 6,
  padding: '12px 16px',
  fontSize: 14,
  color: '#14532d',
  marginBottom: 16,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  marginBottom: 16,
};

const th: React.CSSProperties = {
  background: '#f4f6f8',
  borderBottom: '2px solid #e8eaed',
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#374151',
  fontSize: 12,
  letterSpacing: 0.3,
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e8eaed',
  color: '#374151',
  verticalAlign: 'top',
};

const tdCode: React.CSSProperties = {
  ...td,
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#1a1a2e',
};

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionDivider() {
  return <div style={{ height: 1, background: '#e8eaed', margin: '32px 0' }} />;
}

interface ChecklistItemProps {
  step: number;
  done: boolean;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
  manual?: boolean;
}

function ChecklistItem({ step, done, title, description, href, linkLabel, manual }: ChecklistItemProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: '14px 0',
      borderBottom: '1px solid #e8eaed',
    }}>
      <div style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: done ? '#22c55e' : '#e8eaed',
        color: done ? '#fff' : '#9ca3af',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
      }}>
        {done ? '✓' : step}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{title}</span>
          {manual && (
            <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
              Manual step
            </span>
          )}
          {done && (
            <span style={{ fontSize: 11, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
              Complete
            </span>
          )}
        </div>
        <p style={{ ...bodyText, marginBottom: 4 }}>{description}</p>
        {href && linkLabel && (
          <Link href={href} style={{ fontSize: 13, color: '#00A3E0', textDecoration: 'none', fontWeight: 500 }}>
            {linkLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

interface CsvTableProps {
  columns: { name: string; required: boolean; description: string; example: string }[];
}

function CsvTable({ columns }: CsvTableProps) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Column</th>
            <th style={th}>Required</th>
            <th style={th}>Description</th>
            <th style={th}>Example</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name}>
              <td style={tdCode}>{col.name}</td>
              <td style={{ ...td, textAlign: 'center' }}>{col.required ? '✅' : ''}</td>
              <td style={td}>{col.description}</td>
              <td style={tdCode}>{col.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section: Getting Started ────────────────────────────────────────────────

function SectionGettingStarted({ hasCredentials, hasMapping, hasJob }: { hasCredentials: boolean; hasMapping: boolean; hasJob: boolean }) {
  return (
    <section id="getting-started" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>⚡ Getting Started</h2>
        <p style={bodyText}>
          Follow this checklist to get your Mysoft Integration Platform workspace configured and ready to submit data to Sage Intacct.
        </p>

        <div style={{ marginTop: 16 }}>
          <ChecklistItem
            step={1}
            done={hasCredentials}
            title="Configure Intacct credentials"
            description="Enter your Sage Intacct Company ID, API user credentials, and Web Services sender details."
            href="/settings/integrations"
            linkLabel="Go to Settings → Integrations"
          />
          <ChecklistItem
            step={2}
            done={false}
            title="Authorize Web Services in Intacct"
            description="In Intacct: Company Admin → Web Services Authorizations → add your Sender ID. Required before any data can be posted."
            manual
          />
          <ChecklistItem
            step={3}
            done={false}
            title="Set Entity ID (multi-entity)"
            description="If your Intacct company uses multiple entities, enter the Entity / Location ID in credentials. Leave blank for single-entity companies."
            href="/settings/integrations"
            linkLabel="Go to Settings → Integrations"
            manual
          />
          <ChecklistItem
            step={4}
            done={hasMapping}
            title="Create or assign a field mapping"
            description="Create a custom mapping or clone one of the 7 standard templates (Journal Entry, Payroll Journal, AR Invoice, AP Bill, Expense Report, AR Payment, AP Payment)."
            href="/mappings"
            linkLabel="Go to Mappings"
          />
          <ChecklistItem
            step={5}
            done={hasJob}
            title="Upload your first file"
            description="Upload a CSV file and select your mapping. Enable Auto-process to submit directly to Intacct."
            href="/uploads"
            linkLabel="Go to Uploads"
          />
          <ChecklistItem
            step={6}
            done={hasJob}
            title="Review the job log"
            description="After processing, view the detailed log for each job to see what was submitted, any errors, and Intacct RECORDNOs."
            href="/jobs"
            linkLabel="Go to Job History"
          />
        </div>

        <div style={{ ...callout, marginTop: 24 }}>
          <strong>Need help configuring Intacct?</strong> Your Mysoft implementation consultant can assist with Web Services setup and entity configuration.
        </div>
      </div>
    </section>
  );
}

// ── Section: Uploading Files ────────────────────────────────────────────────

function SectionUploadingFiles() {
  return (
    <section id="uploading-files" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>📤 Uploading Files</h2>
        <p style={bodyText}>
          You can upload files manually through the browser or push them programmatically via the API. All uploads are stored securely and tied to your tenant.
        </p>

        <h3 style={subHeading}>Manual upload walkthrough</h3>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Navigate to <Link href="/uploads" style={{ color: '#00A3E0' }}>Uploads</Link> in the sidebar.</li>
          <li style={{ marginBottom: 8 }}>Click <strong>Upload file</strong> and select your CSV from disk.</li>
          <li style={{ marginBottom: 8 }}>Choose a <strong>field mapping</strong> that matches your CSV column layout.</li>
          <li style={{ marginBottom: 8 }}>
            Optionally enable <strong>Auto-process</strong> — when checked, the file will be submitted to Intacct immediately after upload without requiring a manual trigger.
          </li>
          <li style={{ marginBottom: 8 }}>Click <strong>Submit</strong>. The job will appear in Job History within seconds.</li>
        </ol>

        <h3 style={subHeading}>Supported file types</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Format</th>
                <th style={th}>Extension</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['CSV', '.csv', 'UTF-8 or Windows-1252 encoding. Headers in row 1.'],
                ['Excel', '.xlsx', 'First sheet used. Headers in row 1. Excel date serials auto-converted.'],
                ['Excel (legacy)', '.xls', 'Supported but .xlsx preferred.'],
              ].map(([fmt, ext, note]) => (
                <tr key={fmt}>
                  <td style={{ ...td, fontWeight: 600 }}>{fmt}</td>
                  <td style={tdCode}>{ext}</td>
                  <td style={td}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>How Auto-process works</h3>
        <p style={bodyText}>
          When Auto-process is enabled, the platform automatically invokes the processing pipeline immediately after the file is successfully stored. The job status moves from <strong>queued</strong> → <strong>processing</strong> → <strong>completed</strong> (or <strong>completed_with_errors</strong> / <strong>failed</strong>).
        </p>
        <p style={bodyText}>
          If Auto-process is disabled, the job sits in <strong>queued</strong> status until you manually trigger processing from the Job History page.
        </p>

        <h3 style={subHeading}>Row quota preview</h3>
        <p style={bodyText}>
          After your file is validated (header check + row count), the upload page shows a <strong>quota projection</strong>: how many rows are in the file, how many rows your tenant has used this month, and what percentage of your plan limit will be consumed if you proceed. A green indicator means you have headroom; a red warning means this upload would push you over your monthly limit.
        </p>

        <h3 style={subHeading}>Entity ID override</h3>
        <p style={bodyText}>
          For multi-entity Intacct companies, you can select a target entity from the dropdown on the upload page. The dropdown is populated from your Intacct credentials — it shows all entities your API user has access to, named as <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ENTITYID — Entity Name</code>.
        </p>
        <div style={infoBox}>
          <strong>Per-user entity restrictions:</strong> A tenant admin can restrict individual user accounts to specific entities. If your account has been restricted, only your permitted entities will appear in the dropdown — attempting to submit to a different entity will be rejected. Contact your tenant admin to adjust entity access.
        </div>

        <h3 style={subHeading}>Supporting Document (Intacct supdoc)</h3>
        <p style={bodyText}>
          You can optionally attach a PDF, image, or Office file to an import job. When the job processes, the file is uploaded to Sage Intacct as a supporting document (supdoc) and its ID is stamped on every transaction in that job (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>APBILL</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ARINVOICE</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>GLBATCH</code>).
        </p>
        <p style={{ ...bodyText, marginBottom: 4 }}><strong>To attach a supporting document:</strong></p>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>After selecting your data file, click <strong>+ Attach a supporting document</strong>.</li>
          <li style={{ marginBottom: 8 }}>Select a PDF, PNG, JPG, GIF, DOC, DOCX, XLS, XLSX, or TXT file (max 10 MB).</li>
          <li style={{ marginBottom: 8 }}>Optionally change the Intacct folder name (default: <strong>Mysoft Imports</strong>).</li>
          <li style={{ marginBottom: 8 }}>Proceed with upload — the attachment is uploaded to storage and linked to the job.</li>
        </ol>
        <p style={bodyText}>
          The <code style={{ fontFamily: 'monospace', fontSize: 12 }}>SUPDOCID</code> is written back to the job record once Intacct confirms receipt. If the supdoc upload fails, the job continues without <code style={{ fontFamily: 'monospace', fontSize: 12 }}>SUPDOCID</code> rather than failing entirely.
        </p>
        <div style={infoBox}>
          <strong>Supported file types</strong> match Intacct&apos;s accepted attachment formats. The 10 MB limit applies to the supporting document; the data file limit is 50 MB.
        </div>

        <div style={infoBox}>
          <strong>Duplicate detection:</strong> Each file is hashed with SHA-256 on upload. If the same file content is uploaded again, the platform will reject it as a duplicate to prevent double-posting to Intacct.
        </div>
      </div>
    </section>
  );
}

// ── Section: Job History & Logs ─────────────────────────────────────────────

function SectionJobHistory() {
  return (
    <section id="job-history" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>📋 Job History & Logs</h2>
        <p style={bodyText}>
          Every upload creates a job record. Jobs progress through statuses and produce a detailed processing log you can inspect to understand exactly what happened.
        </p>

        <h3 style={subHeading}>Job statuses</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Colour</th>
                <th style={th}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                { status: 'pending',               colour: 'Grey',           meaning: 'Job created, waiting to be picked up by the processing pipeline.' },
                { status: 'processing',            colour: 'Blue (spinner)', meaning: 'Currently being processed — rows are being validated and submitted to Intacct.' },
                { status: 'awaiting_approval',     colour: 'Purple',         meaning: 'Upload requires sign-off before processing. Pending review in the Approvals queue.' },
                { status: 'completed',             colour: 'Green',          meaning: 'All rows submitted successfully to Intacct. No errors.' },
                { status: 'completed_with_errors', colour: 'Amber',          meaning: 'Some rows submitted to Intacct; others had validation or Intacct errors. Review the error queue for the failed rows.' },
                { status: 'failed',                colour: 'Red',            meaning: 'Job could not be processed at all — a fatal error occurred before any rows were submitted. Check the error message on the job.' },
                { status: 'cancelled',             colour: 'Grey',           meaning: 'Job was manually cancelled or rejected during the approval workflow.' },
              ].map((row) => (
                <tr key={row.status}>
                  <td style={tdCode}>{row.status}</td>
                  <td style={td}>{row.colour}</td>
                  <td style={td}>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Retry vs Re-process — what&apos;s the difference?</h3>
        <p style={bodyText}>
          Two recovery actions appear on jobs that have not completed successfully. They do different things:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#14532d', marginBottom: 6 }}>🔄 Retry</div>
            <p style={{ ...bodyText, color: '#14532d', margin: 0 }}>
              Resets the <strong>existing job</strong> back to <code style={{ fontFamily: 'monospace', fontSize: 12 }}>pending</code> so it can be processed again using its already-stored file. The job ID stays the same. Only available on <code style={{ fontFamily: 'monospace', fontSize: 12 }}>failed</code> jobs — jobs where something went wrong before Intacct was even reached (e.g. a credential error, network timeout, or infrastructure issue). Use Retry when you&apos;ve fixed the underlying problem and want to re-run the same job.
            </p>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', marginBottom: 6 }}>📄 Re-process</div>
            <p style={{ ...bodyText, color: '#1e3a8a', margin: 0 }}>
              Creates a <strong>brand-new job</strong> from the same uploaded file. The original job is untouched and remains in Job History. Available on any job that is not currently processing (including <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed_with_errors</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>failed</code>, and <code style={{ fontFamily: 'monospace', fontSize: 12 }}>cancelled</code>). Use Re-process when you have corrected a mapping, updated credentials, or want a clean second attempt without modifying the original job record.
            </p>
          </div>
        </div>
        <div style={callout}>
          <strong>Why can&apos;t I Retry a completed_with_errors job?</strong> A job that completed with errors did reach Intacct — some rows were posted successfully. Retrying would risk double-posting those rows. Instead, use <strong>Re-process</strong> (which creates a new job) after correcting the source data, or fix individual rows using the <Link href="/errors" style={{ color: '#92350f' }}>Error Queue</Link>.
        </div>

        <h3 style={subHeading}>Processing log levels</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Level</th>
                <th style={th}>Colour</th>
                <th style={th}>When used</th>
              </tr>
            </thead>
            <tbody>
              {[
                { level: 'info',    colour: 'Grey',  when: 'Normal pipeline steps — file parsed, credentials loaded, rows grouped, etc.' },
                { level: 'success', colour: 'Green', when: 'Successful Intacct submission — includes the returned RECORDNO.' },
                { level: 'warn',    colour: 'Amber', when: 'Non-fatal issue — e.g. no RECORDNO returned in the response, unexpected field.' },
                { level: 'error',   colour: 'Red',   when: 'Intacct rejection or validation failure — includes the full error detail from Intacct.' },
              ].map((row) => (
                <tr key={row.level}>
                  <td style={tdCode}>{row.level}</td>
                  <td style={td}>{row.colour}</td>
                  <td style={td}>{row.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Drilling into the processing log</h3>
        <p style={bodyText}>
          Open any job in Job History and scroll to the <strong>Processing Log</strong> section. Each log entry shows a timestamp, level badge, and message. Click the expand arrow on an entry to reveal the raw Intacct request/response XML.
        </p>
        <div style={infoBox}>
          The <code style={{ fontFamily: 'monospace', fontSize: 12 }}>intacctRawXml</code> field shows up to the first 1,500 characters of the actual XML returned by Intacct. Error objects contain: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>errorno</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>description</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>description2</code>, and <code style={{ fontFamily: 'monospace', fontSize: 12 }}>correction</code>. The <strong>correction</strong> field often tells you exactly what Intacct expects.
        </div>

        <h3 style={subHeading}>Finding the Intacct RECORDNO</h3>
        <p style={bodyText}>
          When Intacct accepts a journal entry, it returns a <strong>RECORDNO</strong> (e.g. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>2699</code>). This is the unique identifier for the transaction in Intacct&apos;s General Ledger. You can find the entry in Intacct under <strong>General Ledger → Journal Entries</strong> and search by the RECORDNO.
        </p>
        <p style={bodyText}>
          RECORDNOs are visible in the processing log on each successful <code style={{ fontFamily: 'monospace', fontSize: 12 }}>success</code> level entry, and also aggregated in the job summary on the Job History page.
        </p>
      </div>
    </section>
  );
}

// ── Section: Automated Ingestion ────────────────────────────────────────────

function SectionAutomatedIngestion() {
  return (
    <section id="automated-ingestion" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>🔄 Automated Ingestion</h2>
        <p style={bodyText}>
          In addition to manual browser uploads, the platform supports automated file ingestion via API keys and the Windows Agent.
        </p>

        <h3 style={subHeading}>Creating API keys</h3>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Go to <Link href="/settings" style={{ color: '#00A3E0' }}>Settings</Link> → <strong>API Keys</strong>.</li>
          <li style={{ marginBottom: 8 }}>Click <strong>Create API Key</strong>, give it a descriptive name (e.g. &quot;Windows Agent – Payroll Server&quot;).</li>
          <li style={{ marginBottom: 8 }}>Copy the key immediately — it is shown only once and cannot be retrieved later.</li>
          <li style={{ marginBottom: 8 }}>Use this key as a <strong>Bearer token</strong> on all API requests: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>Authorization: Bearer mip_live_xxxxxxxxxxxx</code></li>
        </ol>

        <div style={callout}>
          <strong>Important:</strong> API keys are scoped to your tenant. Keep them secret — treat them like passwords. Rotate keys immediately if you suspect a compromise.
        </div>

        <h3 style={subHeading}>Windows Agent — configuration & install</h3>
        <p style={bodyText}>
          The Windows Agent is a lightweight background service that watches a local folder (or SFTP location) and pushes new files automatically to the platform API.
        </p>
        <p style={{ ...bodyText, marginBottom: 4 }}><strong>Configuration file</strong> (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>agent.config.json</code>):</p>
        <div style={codeBlock}>
{`{
  "apiKey": "mip_live_xxxxxxxxxxxx",
  "apiUrl": "https://app.mysoft-integration.com/api/v1",
  "mappingId": "your-mapping-uuid",
  "watchFolder": "C:\\\\IntacctExports\\\\Payroll",
  "filePattern": "*.csv",
  "archiveAction": "move",
  "archiveFolder": "C:\\\\IntacctExports\\\\Archive",
  "autoProcess": true,
  "pollIntervalSeconds": 60
}`}
        </div>
        <p style={{ ...bodyText, marginBottom: 4 }}><strong>Installation:</strong></p>
        <div style={codeBlock}>
{`# Run as Administrator
installer.exe /install /config:"C:\\agent.config.json"

# Verify service is running
sc query MysoftIntegrationAgent`}
        </div>
        <p style={bodyText}>
          The agent registers as a Windows Service named <code style={{ fontFamily: 'monospace', fontSize: 12 }}>MysoftIntegrationAgent</code> and starts automatically on boot. Logs are written to <code style={{ fontFamily: 'monospace', fontSize: 12 }}>%ProgramData%\MysoftAgent\logs\</code>.
        </p>

        <h3 style={subHeading}>Direct API push (curl example)</h3>
        <p style={bodyText}>You can push files directly using any HTTP client. All API requests use <code style={{ fontFamily: 'monospace', fontSize: 12 }}>Authorization: Bearer &lt;key&gt;</code>:</p>
        <div style={codeBlock}>
{`# Step 1: compute SHA-256 of the file
sha256=$(sha256sum payroll_march_2026.csv | awk '{print $1}')

# Step 2: submit
curl -X POST https://app.mysoft-integration.com/api/v1/ingest \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx" \\
  -F "file=@payroll_march_2026.csv" \\
  -F "filename=payroll_march_2026.csv" \\
  -F "sha256=$sha256" \\
  -F "mappingId=your-mapping-uuid"`}
        </div>
        <p style={bodyText}>
          A successful response returns a <code style={{ fontFamily: 'monospace', fontSize: 12 }}>jobId</code>. Poll the status until it reaches <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed</code>:
        </p>
        <div style={codeBlock}>
{`curl https://app.mysoft-integration.com/api/v1/jobs/{jobId}/status \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx"`}
        </div>

        <h3 style={subHeading}>Watcher execution log</h3>
        <p style={bodyText}>
          Each watcher records an execution log every time it runs — whether that&apos;s an SFTP poll completing or an HTTP push being received. You can view this history in <Link href="/settings/watchers" style={{ color: '#00A3E0' }}>Settings → Watchers</Link>: expand any watcher to see when it last ran, how many files were found, ingested, skipped (duplicates), and rejected (pattern mismatch or errors), along with any error message.
        </p>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Column</th>
                <th style={th}>What it means</th>
              </tr>
            </thead>
            <tbody>
              {[
                { col: 'Last ran',       desc: 'Timestamp of the most recent execution (poll completion or push receipt).' },
                { col: 'Files found',    desc: 'How many files matched the watcher\'s file pattern on the SFTP server (SFTP only).' },
                { col: 'Ingested',       desc: 'Files that were new (passed duplicate check) and successfully uploaded as jobs.' },
                { col: 'Skipped',        desc: 'Files that were already seen before (duplicate SHA-256) — not re-ingested.' },
                { col: 'Rejected',       desc: 'Files that matched the poll location but were rejected (wrong pattern, processing error).' },
              ].map((row) => (
                <tr key={row.col}>
                  <td style={{ ...td, fontWeight: 600 }}>{row.col}</td>
                  <td style={td}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Archiving a watcher</h3>
        <p style={bodyText}>
          Watchers cannot be permanently deleted while they have associated job history — the jobs would lose their source reference. Instead, use the <strong>📦 Archive</strong> button to retire a watcher. Archiving immediately disables the watcher and removes it from the Settings list, but retains the underlying record so all job history remains intact and auditable. If you need a watcher removed entirely, contact your platform administrator once all associated jobs have been cleared.
        </p>

        <h3 style={subHeading}>Testing an SFTP connection</h3>
        <p style={bodyText}>
          When creating or editing an SFTP watcher, use the <strong>⚡ Test SFTP Connection</strong> button in Step 2 to verify that the platform can reach your SFTP server before saving. The test attempts to connect and list the remote path — a success message confirms that credentials and network access are correct. Common failures: wrong password, host unreachable, remote path does not exist.
        </p>

        <h3 style={subHeading}>HTTP push token security</h3>
        <p style={bodyText}>
          HTTP Push watchers authenticate using a push token embedded in the URL (e.g. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>/api/v1/push/abc123...</code>). Anyone with this URL can deliver files to your watcher — treat the token as a password.
        </p>
        <p style={bodyText}>
          In <Link href="/settings/watchers" style={{ color: '#00A3E0' }}>Settings → Watchers</Link>, the push URL is hidden by default and shown only after clicking <strong>reveal</strong>. This prevents the token being exposed to anyone briefly glancing at your screen. To copy the URL, click reveal then use the copy button — the token is masked again if you navigate away.
        </p>
        <div style={callout}>
          If you suspect a push token has been leaked, archive the watcher (📦 button in Settings → Watchers) and create a new one — this generates a fresh token and invalidates the old URL. Archiving preserves the job history linked to the old watcher.
        </div>

        <div style={infoBox}>
          For a full API reference including webhook configuration and all available endpoints, see the <strong>Developer &amp; API</strong> section in this Help Centre.
        </div>
      </div>
    </section>
  );
}

// ── Section: CSV Format Reference ──────────────────────────────────────────

const JE_COLUMNS = [
  { name: 'journal_symbol', required: true,  description: 'Intacct journal code',                               example: 'GJ' },
  { name: 'posting_date',   required: true,  description: 'Posting date (any accepted format)',                  example: '16/03/2026' },
  { name: 'description',    required: false, description: 'Batch description',                                  example: 'March Payroll' },
  { name: 'reference_no',   required: false, description: 'Reference number',                                   example: 'REF-001' },
  { name: 'gl_account',     required: true,  description: 'GL account number',                                  example: '60420' },
  { name: 'amount',         required: true,  description: 'Absolute amount (no sign)',                          example: '1500.00' },
  { name: 'debit_credit',   required: true,  description: 'debit or credit',                                    example: 'debit' },
  { name: 'memo',           required: false, description: 'Line memo',                                          example: 'Wages' },
  { name: 'location_id',    required: false, description: 'Entity/location (blank = use credential default)',   example: '100' },
  { name: 'department_id',  required: false, description: 'Department code',                                    example: 'SALES' },
  { name: 'project_id',     required: false, description: 'Project code',                                       example: 'P001' },
  { name: 'class_id',       required: false, description: 'Class code',                                         example: 'CL01' },
  { name: 'customer_id',    required: false, description: 'Customer dimension',                                 example: 'C001' },
  { name: 'vendor_id',      required: false, description: 'Vendor dimension',                                   example: 'V001' },
  { name: 'employee_id',    required: false, description: 'Employee dimension',                                 example: 'E001' },
  { name: 'item_id',        required: false, description: 'Item dimension',                                     example: 'ITEM01' },
  { name: 'currency',       required: false, description: 'Currency code',                                      example: 'GBP' },
];

const PAYROLL_COLUMNS = [
  { name: 'journal_symbol', required: true,  description: 'Usually GJ or PAYROLL',      example: 'GJ' },
  { name: 'pay_date',       required: true,  description: 'Pay run date',                example: '31/03/2026' },
  { name: 'pay_reference',  required: false, description: 'Payroll run reference',       example: 'PR-2026-03' },
  { name: 'description',    required: false, description: 'Description',                 example: 'March 2026 Payroll' },
  { name: 'account_no',     required: true,  description: 'GL account number',           example: '70100' },
  { name: 'amount',         required: true,  description: 'Absolute amount',             example: '45000.00' },
  { name: 'debit_credit',   required: true,  description: 'debit or credit',             example: 'debit' },
  { name: 'memo',           required: false, description: 'Line memo',                   example: 'Gross Wages' },
  { name: 'department_id',  required: false, description: 'Department',                  example: 'HR' },
  { name: 'employee_id',    required: false, description: 'Employee code',               example: 'E001' },
  { name: 'location_id',    required: false, description: 'Entity override',             example: '' },
  { name: 'project_id',     required: false, description: 'Project',                     example: '' },
  { name: 'class_id',       required: false, description: 'Class',                       example: '' },
  { name: 'currency',       required: false, description: 'Currency',                    example: 'GBP' },
];

const AR_INVOICE_COLUMNS = [
  { name: 'customer_id',     required: true,  description: 'Intacct customer ID',           example: 'CUST001' },
  { name: 'invoice_date',    required: true,  description: 'Invoice date',                  example: '16/03/2026' },
  { name: 'due_date',        required: false, description: 'Due date',                      example: '15/04/2026' },
  { name: 'payment_term',    required: false, description: 'Payment terms code',            example: 'Net30' },
  { name: 'description',     required: false, description: 'Invoice description',           example: 'March services' },
  { name: 'reference_no',    required: false, description: 'Your reference',               example: 'INV-2026-001' },
  { name: 'currency',        required: false, description: 'Currency',                      example: 'GBP' },
  { name: 'revenue_account', required: true,  description: 'Revenue GL account',           example: '40000' },
  { name: 'amount',          required: true,  description: 'Line amount',                   example: '5000.00' },
  { name: 'unit_price',      required: false, description: 'Unit price',                    example: '500.00' },
  { name: 'quantity',        required: false, description: 'Quantity',                      example: '10' },
  { name: 'tax_solution_id', required: false, description: 'UK VAT tax solution',          example: 'UK_VAT' },
  { name: 'line_memo',       required: false, description: 'Line description',              example: 'Consulting' },
  { name: 'location_id',     required: false, description: 'Location',                      example: '' },
  { name: 'department_id',   required: false, description: 'Department',                    example: 'SALES' },
  { name: 'project_id',      required: false, description: 'Project',                       example: '' },
  { name: 'class_id',        required: false, description: 'Class',                         example: '' },
  { name: 'item_id',         required: false, description: 'Inventory item',               example: '' },
];

const AP_BILL_COLUMNS = [
  { name: 'vendor_id',        required: true,  description: 'Intacct vendor ID',                       example: 'VEND001' },
  { name: 'bill_date',        required: true,  description: 'Bill date',                                example: '16/03/2026' },
  { name: 'due_date',         required: false, description: 'Due date',                                 example: '15/04/2026' },
  { name: 'payment_term',     required: false, description: 'Payment terms code',                      example: 'Net30' },
  { name: 'description',      required: false, description: 'Bill description',                         example: 'March supplier invoice' },
  { name: 'reference_no',     required: false, description: 'Your reference / supplier invoice number', example: 'BILL-2026-001' },
  { name: 'currency',         required: false, description: 'Currency',                                 example: 'GBP' },
  { name: 'expense_account',  required: true,  description: 'Expense GL account',                      example: '50000' },
  { name: 'amount',           required: true,  description: 'Line amount',                              example: '2500.00' },
  { name: 'unit_price',       required: false, description: 'Unit price',                               example: '250.00' },
  { name: 'quantity',         required: false, description: 'Quantity',                                  example: '10' },
  { name: 'tax_solution_id',  required: false, description: 'UK VAT tax solution',                     example: 'UK_VAT' },
  { name: 'line_memo',        required: false, description: 'Line description',                         example: 'IT hardware' },
  { name: 'location_id',      required: false, description: 'Location',                                 example: '' },
  { name: 'department_id',    required: false, description: 'Department',                               example: 'IT' },
  { name: 'project_id',       required: false, description: 'Project',                                  example: '' },
  { name: 'class_id',         required: false, description: 'Class',                                    example: '' },
  { name: 'item_id',          required: false, description: 'Inventory item',                           example: '' },
];

const EXPENSE_COLUMNS = [
  { name: 'employee_id',   required: true,  description: 'Intacct employee ID',                     example: 'EMP001' },
  { name: 'report_date',   required: true,  description: 'Report date',                              example: '16/03/2026' },
  { name: 'expense_date',  required: false, description: 'Individual expense date',                  example: '15/03/2026' },
  { name: 'description',   required: false, description: 'Report title',                             example: 'March expenses' },
  { name: 'reference_no',  required: false, description: 'Reference',                                example: 'EXP-001' },
  { name: 'currency',      required: false, description: 'Currency',                                 example: 'GBP' },
  { name: 'expense_type',  required: true,  description: 'Expense type (must match Intacct exactly)', example: 'Meals' },
  { name: 'amount',        required: true,  description: 'Amount',                                   example: '45.00' },
  { name: 'memo',          required: false, description: 'Notes',                                    example: 'Client lunch' },
  { name: 'location_id',   required: false, description: 'Location',                                 example: '' },
  { name: 'department_id', required: false, description: 'Department',                               example: '' },
  { name: 'project_id',    required: false, description: 'Project',                                  example: '' },
  { name: 'class_id',      required: false, description: 'Class',                                    example: '' },
];

const AR_PAYMENT_COLUMNS = [
  { name: 'customer_id',     required: true,  description: 'Customer ID',             example: 'CUST001' },
  { name: 'payment_date',    required: true,  description: 'Payment date',            example: '16/03/2026' },
  { name: 'amount',          required: true,  description: 'Payment amount',          example: '5000.00' },
  { name: 'payment_method',  required: false, description: 'Check/EFT/Cash/Credit card', example: 'EFT' },
  { name: 'bank_account_id', required: false, description: 'Bank account GL code',   example: 'BNK-GBP' },
  { name: 'currency',        required: false, description: 'Currency',                example: 'GBP' },
  { name: 'description',     required: false, description: 'Description',             example: 'Stripe payment batch' },
  { name: 'reference_no',    required: false, description: 'Reference',              example: 'STRIPE-001' },
  { name: 'location_id',     required: false, description: 'Location',               example: '' },
  { name: 'department_id',   required: false, description: 'Department',             example: '' },
];

const AP_PAYMENT_COLUMNS = [
  { name: 'vendor_id',       required: true,  description: 'Vendor ID',              example: 'VEND001' },
  { name: 'payment_date',    required: true,  description: 'Payment date',            example: '16/03/2026' },
  { name: 'amount',          required: true,  description: 'Payment amount',          example: '2500.00' },
  { name: 'payment_method',  required: false, description: 'Check/EFT/Cash/Credit card', example: 'EFT' },
  { name: 'bank_account_id', required: false, description: 'Bank account GL code',   example: 'BNK-GBP' },
  { name: 'currency',        required: false, description: 'Currency',                example: 'GBP' },
  { name: 'description',     required: false, description: 'Description',             example: 'Supplier payment run' },
  { name: 'reference_no',    required: false, description: 'Reference',              example: 'PAY-001' },
  { name: 'location_id',     required: false, description: 'Location',               example: '' },
  { name: 'department_id',   required: false, description: 'Department',             example: '' },
];

function SectionCsvFormat() {
  return (
    <section id="csv-format" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>📊 CSV Format Reference</h2>
        <p style={bodyText}>
          The platform supports 7 transaction types. Each type has its own expected columns. Column names are case-insensitive and extra columns are ignored. Use the field mapping editor to map your column names to the expected names if they differ.
        </p>

        <h3 style={subHeading}>1. Standard Journal Entry</h3>
        <CsvTable columns={JE_COLUMNS} />
        <div style={infoBox}>
          <strong>Grouping:</strong> Rows sharing the same <code style={{ fontFamily: 'monospace', fontSize: 12 }}>journal_symbol</code> + <code style={{ fontFamily: 'monospace', fontSize: 12 }}>posting_date</code> + <code style={{ fontFamily: 'monospace', fontSize: 12 }}>description</code> are grouped into one GLBATCH (one journal entry header with multiple lines). Ensure each group has balanced debits and credits.
        </div>

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>2. Payroll Journal</h3>
        <p style={bodyText}>Uses payroll-friendly column names. Internally mapped to the same Intacct GLBATCH structure as a standard journal entry.</p>
        <CsvTable columns={PAYROLL_COLUMNS} />

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>3. AR Invoice</h3>
        <CsvTable columns={AR_INVOICE_COLUMNS} />

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>4. AP Bill</h3>
        <CsvTable columns={AP_BILL_COLUMNS} />

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>5. Expense Report</h3>
        <CsvTable columns={EXPENSE_COLUMNS} />
        <div style={callout}>
          <strong>expense_type</strong> must exactly match an expense type configured in Intacct (case-sensitive). Check Intacct under <strong>Time & Expense → Configuration → Expense Types</strong>.
        </div>

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>6. AR Payment (Cash Receipt)</h3>
        <CsvTable columns={AR_PAYMENT_COLUMNS} />

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>7. AP Payment</h3>
        <p style={bodyText}>Same structure as AR Payment but uses <code style={{ fontFamily: 'monospace', fontSize: 12 }}>vendor_id</code> instead of <code style={{ fontFamily: 'monospace', fontSize: 12 }}>customer_id</code>.</p>
        <CsvTable columns={AP_PAYMENT_COLUMNS} />

        <SectionDivider />

        <h3 style={{ ...subHeading, marginTop: 0 }}>Accepted date formats</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Format</th>
                <th style={th}>Example</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { fmt: 'DD/MM/YYYY',   ex: '16/03/2026', note: 'Default for UK/EU tenants' },
                { fmt: 'MM/DD/YYYY',   ex: '03/16/2026', note: 'Default for US tenants' },
                { fmt: 'YYYY-MM-DD',   ex: '2026-03-16', note: 'ISO 8601 — always accepted' },
                { fmt: 'DD-MM-YYYY',   ex: '16-03-2026', note: 'Also accepted' },
                { fmt: 'DD.MM.YYYY',   ex: '16.03.2026', note: 'Also accepted' },
                { fmt: 'DD/MM/YY',     ex: '16/03/26',   note: '2-digit year: 00–30 = 2000s, 31–99 = 1900s' },
                { fmt: 'Excel serial', ex: '46097',      note: 'Excel date numbers automatically converted' },
              ].map((row) => (
                <tr key={row.fmt}>
                  <td style={tdCode}>{row.fmt}</td>
                  <td style={tdCode}>{row.ex}</td>
                  <td style={td}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Accepted debit/credit values</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Intended</th>
                <th style={th}>Accepted values</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Debit</td>
                <td style={tdCode}>debit, Debit, DEBIT, dr, DR, 1</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Credit</td>
                <td style={tdCode}>credit, Credit, CREDIT, cr, CR, -1</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Section: Intacct Setup ──────────────────────────────────────────────────

function SectionIntacctSetup() {
  return (
    <section id="intacct-setup" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>🔧 Intacct Setup</h2>
        <p style={bodyText}>
          Before the platform can post transactions to Sage Intacct, you must complete the following one-time configuration steps in both the platform and your Intacct company.
        </p>

        <h3 style={subHeading}>Step 1 — Web Services Authorization in Intacct</h3>
        <p style={bodyText}>Intacct requires explicit authorization of your Sender ID before any third-party application can use the API.</p>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Log in to Sage Intacct as a Company Administrator.</li>
          <li style={{ marginBottom: 8 }}>Navigate to <strong>Company Admin → Web Services Authorizations</strong>.</li>
          <li style={{ marginBottom: 8 }}>Click <strong>Add</strong> and enter the Sender ID provided by Mysoft (your implementation consultant will give you this).</li>
          <li style={{ marginBottom: 8 }}>Save the authorization.</li>
        </ol>
        <div style={callout}>
          If you see error <strong>XL03000006</strong> when submitting data, the Sender ID is not yet authorized — or was authorized in the wrong Intacct company. Ensure you are logged into the correct company.
        </div>

        <h3 style={subHeading}>Step 2 — API user requirements</h3>
        <p style={bodyText}>
          The Intacct API user (the credentials you enter in the platform) must:
        </p>
        <ul style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}>Be a <strong>Web Services user</strong> (not a standard login user).</li>
          <li style={{ marginBottom: 6 }}>Have the <strong>permissions</strong> required for the transaction types you intend to post (e.g. GL access for journal entries, AR access for invoices).</li>
          <li style={{ marginBottom: 6 }}>Not be restricted by IP-based access controls that would block API calls from the platform&apos;s servers.</li>
        </ul>

        <h3 style={subHeading}>Step 3 — Enter credentials in the platform</h3>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Go to <Link href="/settings/integrations" style={{ color: '#00A3E0' }}>Settings → Integrations</Link>.</li>
          <li style={{ marginBottom: 8 }}>Enter your <strong>Company ID</strong> (the Intacct company identifier, not the company name).</li>
          <li style={{ marginBottom: 8 }}>Enter the <strong>User ID</strong> and <strong>Password</strong> for your Web Services user.</li>
          <li style={{ marginBottom: 8 }}>Enter the <strong>Sender ID</strong> and <strong>Sender Password</strong> from the Web Services authorization.</li>
          <li style={{ marginBottom: 8 }}>Click <strong>⚡ Test Connection</strong> to verify the credentials connect to Intacct successfully before saving.</li>
          <li style={{ marginBottom: 8 }}>Once the test passes, click <strong>Save</strong> to commit the credentials. The test and save are separate actions — testing does not save, and saving does not test.</li>
        </ol>
        <div style={infoBox}>
          Always run <strong>⚡ Test Connection</strong> after entering or changing credentials. A successful test confirms that the platform can authenticate with Intacct using the values you&apos;ve entered. If the test fails, check the error message — common causes are a wrong password, incorrect Company ID, or the Sender ID not yet being authorized in Intacct Web Services.
        </div>

        <h3 style={subHeading}>Step 4 — Entity ID (multi-entity companies)</h3>
        <p style={bodyText}>
          If your Intacct company uses multiple entities (locations), you must specify the <strong>Entity / Location ID</strong> to direct transactions to the correct entity.
        </p>
        <div style={infoBox}>
          Leave Entity ID blank for single-entity Intacct companies. If you are posting to multiple entities, create separate platform tenants or use the <code style={{ fontFamily: 'monospace', fontSize: 12 }}>location_id</code> column in your CSV to override per-row.
        </div>
        <p style={bodyText}>
          The Entity ID can be found in Intacct under <strong>Company Admin → Entities</strong>. It is typically a short alphanumeric code like <code style={{ fontFamily: 'monospace', fontSize: 12 }}>100</code> or <code style={{ fontFamily: 'monospace', fontSize: 12 }}>UK01</code>.
        </p>
        <p style={bodyText}>
          If the Entity ID is missing but a GL account requires a location dimension, you will see error <strong>BL03000018</strong>. Set the Entity ID in <Link href="/settings/integrations" style={{ color: '#00A3E0' }}>Settings → Integrations</Link>.
        </p>
      </div>
    </section>
  );
}

// ── Section: Troubleshooting ────────────────────────────────────────────────

function SectionTroubleshooting() {
  const errors = [
    {
      code: 'XL03000006',
      meaning: 'Sender ID not authorized for Web Services',
      fix: 'In Intacct: Company Admin → Web Services Authorizations → add your Sender ID.',
    },
    {
      code: 'BL03000018',
      meaning: 'Missing Location dimension for a GL account',
      fix: 'Set the Entity ID in Settings → Integrations (Credentials → Entity / Location ID).',
    },
    {
      code: 'XL03000006 (wrong company)',
      meaning: 'Sender authorized in wrong Intacct company',
      fix: 'Ensure you are authorizing in the correct Intacct company — the Company ID must match the one entered in platform credentials.',
    },
    {
      code: 'Duplicate file',
      meaning: 'SHA-256 hash matches a previous upload',
      fix: 'The file has been uploaded before. If intentional, modify the file content slightly (e.g. a comment row) to create a different hash.',
    },
    {
      code: 'Date parse failure',
      meaning: 'Date column value not recognized as a valid date',
      fix: 'Check the accepted date formats in the CSV Format Reference section. Ensure no mixed formats within the same column.',
    },
    {
      code: 'Job stuck in processing',
      meaning: 'Function timeout or infrastructure issue',
      fix: 'Check Vercel function logs for timeout errors. Try manually re-triggering via the Process button on the job in Job History.',
    },
    {
      code: 'No RECORDNO returned',
      meaning: 'Intacct accepted the request but returned no record key',
      fix: 'Check the raw Intacct XML in the processing log for the actual response. The transaction may have been created — verify directly in Intacct.',
    },
    {
      code: 'EMPLOYEEID not recognized',
      meaning: "Employee ID doesn't exist in Intacct",
      fix: 'Create the employee record in Intacct (Time & Expense → Employees) before submitting expense reports.',
    },
    {
      code: 'CUSTOMERID not recognized',
      meaning: "Customer ID doesn't exist in Intacct",
      fix: 'Create the customer record in Intacct (Accounts Receivable → Customers) first.',
    },
  ];

  return (
    <section id="troubleshooting" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>🛠 Troubleshooting</h2>
        <p style={bodyText}>
          This section covers the most common errors and how to resolve them. Start by checking the processing log on the failed job for the exact error message from Intacct.
        </p>

        <h3 style={subHeading}>Common errors</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 180 }}>Error</th>
                <th style={{ ...th, minWidth: 200 }}>What it means</th>
                <th style={{ ...th, minWidth: 260 }}>How to fix</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.code}>
                  <td style={tdCode}>{e.code}</td>
                  <td style={td}>{e.meaning}</td>
                  <td style={td}>{e.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Reading the processing log</h3>
        <p style={bodyText}>
          Every job has a detailed processing log accessible from the Job History page. To get the most from it:
        </p>
        <ul style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Expand each log entry to see the raw Intacct request/response XML by clicking the expand arrow.</li>
          <li style={{ marginBottom: 8 }}>The <code style={{ fontFamily: 'monospace', fontSize: 12 }}>intacctRawXml</code> field shows the first 1,500 characters of the actual XML returned by Intacct.</li>
          <li style={{ marginBottom: 8 }}>
            Error objects from Intacct contain four fields:
            <ul style={{ marginTop: 6, marginLeft: 16 }}>
              <li><code style={{ fontFamily: 'monospace', fontSize: 12 }}>errorno</code> — the Intacct error code (e.g. XL03000006)</li>
              <li><code style={{ fontFamily: 'monospace', fontSize: 12 }}>description</code> — short error summary</li>
              <li><code style={{ fontFamily: 'monospace', fontSize: 12 }}>description2</code> — additional context</li>
              <li><code style={{ fontFamily: 'monospace', fontSize: 12 }}>correction</code> — what Intacct suggests you do to fix it</li>
            </ul>
          </li>
          <li style={{ marginBottom: 8 }}>The <strong>correction</strong> field is the most useful — it often tells you exactly what value or configuration Intacct expects.</li>
        </ul>

        <div style={infoBox}>
          Still stuck? Contact Mysoft support and include the Job ID and the relevant processing log entries. This speeds up diagnosis significantly.
        </div>
      </div>
    </section>
  );
}

// ── Section: Roles & Permissions ────────────────────────────────────────────

function SectionRolesPermissions() {
  const features: { label: string; psa: boolean; msa: boolean; ta: boolean; to: boolean; au: boolean }[] = [
    { label: 'Upload files',      psa: true,  msa: true,  ta: true,  to: true,  au: false },
    { label: 'View jobs',         psa: true,  msa: true,  ta: true,  to: true,  au: true  },
    { label: 'View job log',      psa: true,  msa: true,  ta: true,  to: true,  au: true  },
    { label: 'Manage errors',     psa: true,  msa: true,  ta: true,  to: true,  au: false },
    { label: 'Manage mappings',   psa: true,  msa: true,  ta: true,  to: true,  au: false },
    { label: 'View audit log',    psa: true,  msa: true,  ta: true,  to: true,  au: true  },
    { label: 'Manage settings',   psa: true,  msa: true,  ta: true,  to: false, au: false },
    { label: 'Create API keys',   psa: true,  msa: true,  ta: true,  to: false, au: false },
    { label: 'Manage users',      psa: true,  msa: true,  ta: true,  to: false, au: false },
    { label: 'Platform admin',    psa: true,  msa: true,  ta: false, to: false, au: false },
    { label: 'Manage tenants',    psa: true,  msa: false, ta: false, to: false, au: false },
  ];

  const Tick = ({ yes }: { yes: boolean }) => (
    <span style={{ color: yes ? '#15803d' : '#d1d5db', fontSize: 16 }}>{yes ? '✅' : '—'}</span>
  );

  const roleHeaderStyle: React.CSSProperties = {
    ...th,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
  };

  return (
    <section id="roles-permissions" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>🔒 Roles & Permissions</h2>
        <p style={bodyText}>
          The platform uses five roles. Access is enforced both in the UI and at the API/database level.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 160 }}>Feature</th>
                <th style={roleHeaderStyle}>platform_super_admin</th>
                <th style={roleHeaderStyle}>mysoft_support_admin</th>
                <th style={roleHeaderStyle}>tenant_admin</th>
                <th style={roleHeaderStyle}>tenant_operator</th>
                <th style={roleHeaderStyle}>tenant_auditor</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.label}>
                  <td style={{ ...td, fontWeight: 500 }}>{f.label}</td>
                  <td style={{ ...td, textAlign: 'center' }}><Tick yes={f.psa} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Tick yes={f.msa} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Tick yes={f.ta} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Tick yes={f.to} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Tick yes={f.au} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Role descriptions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { role: 'platform_super_admin', desc: 'Full access to everything — all tenants, all settings, all platform configuration. Mysoft internal use only.' },
            { role: 'mysoft_support_admin', desc: 'Platform-level access for support staff. Can view and manage all tenants but cannot change platform-level settings.' },
            { role: 'tenant_admin',         desc: 'Full access within their tenant — uploads, mappings, jobs, errors, settings, users, and API keys.' },
            { role: 'tenant_operator',      desc: 'Day-to-day operational access — can upload files, manage mappings, view jobs, and manage errors. Cannot access settings or create API keys.' },
            { role: 'tenant_auditor',       desc: 'Read-only access — can view jobs, the processing log, and the audit trail. Cannot make any changes.' },
          ].map((r) => (
            <div key={r.role} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <code style={{ fontFamily: 'monospace', fontSize: 12, background: '#f4f6f8', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                {r.role}
              </code>
              <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Approval Workflow ───────────────────────────────────────────────

function SectionApprovalWorkflow() {
  return (
    <section id="approval-workflow" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>✅ Approval Workflow</h2>
        <p style={bodyText}>
          Some uploads require sign-off before data is posted to Intacct, controlled by the <strong>Requires Approval</strong> setting on a mapping.
        </p>

        <h3 style={subHeading}>How it works</h3>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>An upload creates a job with status <strong>Awaiting Approval</strong>.</li>
          <li style={{ marginBottom: 8 }}>The tenant admin is notified that a job is waiting for review.</li>
          <li style={{ marginBottom: 8 }}>The admin approves or rejects the job on the <Link href="/approvals" style={{ color: '#00A3E0' }}>Approvals</Link> page.</li>
          <li style={{ marginBottom: 8 }}>Approved jobs are queued for processing and submitted to Intacct. Rejected jobs are archived.</li>
        </ol>

        <h3 style={subHeading}>Enabling approval requirement</h3>
        <p style={bodyText}>
          In <Link href="/mappings" style={{ color: '#00A3E0' }}>Mappings</Link> &rarr; Edit, tick the <strong>Require Approval</strong> checkbox. Any upload using that mapping will require approval before processing.
        </p>

        <h3 style={subHeading}>Who can approve</h3>
        <p style={bodyText}>
          Only users with the <strong>Tenant Admin</strong> role can approve or reject jobs. Operators and auditors cannot.
        </p>

        <div style={callout}>
          <strong>Frequently asked questions</strong>
          <ul style={{ ...bodyText, paddingLeft: 20, marginTop: 8, marginBottom: 0 }}>
            <li style={{ marginBottom: 6 }}><strong>Can I approve my own upload?</strong> Yes — there is no self-approval restriction.</li>
            <li style={{ marginBottom: 6 }}><strong>What if a job is never approved?</strong> It stays in Awaiting Approval indefinitely. The uploaded file is not deleted.</li>
            <li style={{ marginBottom: 0 }}><strong>Can I see rejected jobs?</strong> Yes — rejected jobs appear in <Link href="/jobs" style={{ color: '#00A3E0' }}>Job History</Link> with a Cancelled status.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Section: Usage & Plans ───────────────────────────────────────────────────

function SectionUsagePlans() {
  return (
    <section id="usage-plans" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>📈 Usage &amp; Plans</h2>
        <p style={bodyText}>
          Your workspace operates on a subscription plan that defines monthly limits on jobs, rows, and storage.
        </p>

        <h3 style={subHeading}>Viewing your usage</h3>
        <p style={bodyText}>
          Go to <Link href="/settings/usage" style={{ color: '#00A3E0' }}>Settings &rarr; Usage</Link> to see progress bars for the current billing period, along with 6 months of history.
        </p>

        <h3 style={subHeading}>Usage limits</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Metric</th>
                <th style={th}>What it measures</th>
                <th style={th}>Resets</th>
              </tr>
            </thead>
            <tbody>
              {[
                { metric: 'Jobs per month', measures: 'Total number of upload jobs created (including failed and cancelled)', resets: '1st of each month' },
                { metric: 'Rows per month', measures: 'Rows successfully posted to Intacct (failed validation rows excluded)', resets: '1st of each month' },
                { metric: 'Storage (MB)',   measures: 'Sum of all uploaded file sizes for the current month',                resets: '1st of each month' },
              ].map((row) => (
                <tr key={row.metric}>
                  <td style={{ ...td, fontWeight: 500 }}>{row.metric}</td>
                  <td style={td}>{row.measures}</td>
                  <td style={td}>{row.resets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Usage warning banners</h3>
        <p style={bodyText}>
          A yellow warning banner appears when you reach 80% of any limit. A red banner appears when you reach 100%. Jobs continue to submit after the limit is reached — your account manager will be notified.
        </p>

        <div style={callout}>
          <strong>Frequently asked questions</strong>
          <ul style={{ ...bodyText, paddingLeft: 20, marginTop: 8, marginBottom: 0 }}>
            <li style={{ marginBottom: 6 }}><strong>What counts as a job?</strong> Each file upload or automated ingestion. Cancelled and failed jobs still count.</li>
            <li style={{ marginBottom: 6 }}><strong>What counts as a row?</strong> Each row successfully posted to Intacct. Failed validation rows do not count.</li>
            <li style={{ marginBottom: 6 }}><strong>When does usage reset?</strong> The 1st of each calendar month.</li>
            <li style={{ marginBottom: 6 }}><strong>What if I exceed my limit?</strong> A warning banner shows on the dashboard. Jobs still submit but your account manager will contact you.</li>
            <li style={{ marginBottom: 6 }}><strong>How is storage calculated?</strong> Sum of uploaded file sizes for the current month, regardless of job status.</li>
            <li style={{ marginBottom: 0 }}><strong>How do I upgrade?</strong> Contact your account manager or email support to upgrade your plan.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Section: New Data Formats ────────────────────────────────────────────────

function SectionNewFormats() {
  return (
    <section id="new-formats" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>📁 New Data Formats</h2>
        <p style={bodyText}>
          In addition to the core transaction types, three additional formats are supported for importing master data and time entries.
        </p>

        <h3 style={subHeading}>Timesheet</h3>
        <p style={bodyText}>
          Import employee time entries directly into Intacct&apos;s Time &amp; Expense module. Each row represents a timesheet line.
        </p>
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                <th style={th}>Required</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: 'Employee ID',   req: true,  note: 'Must match an existing Intacct employee record' },
                { field: 'Begin Date',    req: true,  note: 'Start date of the timesheet period' },
                { field: 'End Date',      req: true,  note: 'End date of the timesheet period' },
                { field: 'Hours',         req: true,  note: 'Number of hours for the line' },
                { field: 'Task ID',       req: false, note: 'Task dimension' },
                { field: 'Time Type',     req: false, note: 'e.g. Regular, Overtime' },
                { field: 'Project ID',    req: false, note: 'Project dimension' },
                { field: 'Customer ID',   req: false, note: 'Customer dimension' },
                { field: 'Department ID', req: false, note: 'Department dimension' },
                { field: 'Location ID',   req: false, note: 'Location dimension' },
              ].map((row) => (
                <tr key={row.field}>
                  <td style={{ ...td, fontWeight: 500 }}>{row.field}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{row.req ? '✅' : ''}</td>
                  <td style={td}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Vendor Import</h3>
        <p style={bodyText}>
          Bulk-import supplier master data into Intacct&apos;s Accounts Payable module. Useful for migrating vendor lists from a legacy system.
        </p>
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                <th style={th}>Required</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: 'Vendor ID',       req: true,  note: 'Unique identifier for the vendor' },
                { field: 'Name',            req: true,  note: 'Display name' },
                { field: 'Status',          req: false, note: 'active or inactive' },
                { field: 'Email',           req: false, note: 'Primary email address' },
                { field: 'Phone',           req: false, note: 'Primary phone number' },
                { field: 'Payment Term',    req: false, note: 'e.g. Net 30' },
                { field: 'Currency',        req: false, note: 'ISO 4217 currency code' },
                { field: 'Tax ID',          req: false, note: 'VAT / tax identification number' },
                { field: 'Address fields',  req: false, note: 'Address1, Address2, City, State, ZIP, Country' },
              ].map((row) => (
                <tr key={row.field}>
                  <td style={{ ...td, fontWeight: 500 }}>{row.field}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{row.req ? '✅' : ''}</td>
                  <td style={td}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Customer Import</h3>
        <p style={bodyText}>
          Bulk-import customer master data into Intacct&apos;s Accounts Receivable module. Same structure as Vendor Import but uses Customer ID and Name.
        </p>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                <th style={th}>Required</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: 'Customer ID',     req: true,  note: 'Unique identifier for the customer' },
                { field: 'Name',            req: true,  note: 'Display name' },
                { field: 'Status',          req: false, note: 'active or inactive' },
                { field: 'Email',           req: false, note: 'Primary email address' },
                { field: 'Phone',           req: false, note: 'Primary phone number' },
                { field: 'Payment Term',    req: false, note: 'e.g. Net 30' },
                { field: 'Currency',        req: false, note: 'ISO 4217 currency code' },
                { field: 'Tax ID',          req: false, note: 'VAT / tax identification number' },
                { field: 'Address fields',  req: false, note: 'Address1, Address2, City, State, ZIP, Country' },
              ].map((row) => (
                <tr key={row.field}>
                  <td style={{ ...td, fontWeight: 500 }}>{row.field}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{row.req ? '✅' : ''}</td>
                  <td style={td}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={infoBox}>
          To use these formats, create a mapping in the <Link href="/mappings" style={{ color: '#1d4ed8' }}>Mappings</Link> section and select <strong>Timesheet</strong>, <strong>Vendor Import</strong>, or <strong>Customer Import</strong> as the transaction type.
        </div>
      </div>
    </section>
  );
}

// ── Section: Developer & API ─────────────────────────────────────────────────

function RoadmapBadge() {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: '#7c3aed',
      background: '#f5f3ff',
      border: '1px solid #ddd6fe',
      borderRadius: 4,
      padding: '1px 7px',
      marginLeft: 8,
      verticalAlign: 'middle',
    }}>
      Roadmap
    </span>
  );
}

function SectionDeveloper() {
  return (
    <section id="developer" style={{ scrollMarginTop: 24 }}>

      {/* ── Overview ── */}
      <div style={card}>
        <h2 style={sectionHeading}>⚙️ Developer &amp; API Reference</h2>
        <p style={bodyText}>
          The Mysoft Integration Platform exposes a REST API that lets you submit files programmatically, poll job status, and receive real-time notifications via webhooks. This section covers everything you need to integrate with or build on top of the platform.
        </p>

        <h3 style={subHeading}>Base URL</h3>
        <div style={codeBlock}>https://app.mysoft-integration.com</div>

        <h3 style={subHeading}>Authentication</h3>
        <p style={bodyText}>
          All API endpoints use <strong>Bearer token authentication</strong>. API keys are created in <Link href="/settings/api-keys" style={{ color: '#00A3E0' }}>Settings → API Keys</Link> and are scoped to your tenant. Keys are prefixed with <code style={{ fontFamily: 'monospace', fontSize: 12 }}>mip_</code> and are shown only once at creation — store them securely.
        </p>
        <div style={codeBlock}>Authorization: Bearer mip_live_xxxxxxxxxxxxxxxxxxxx</div>
        <div style={callout}>
          <strong>Security:</strong> Never commit API keys to source control. On servers, store the key in an environment variable or a secret manager (e.g. Windows Credential Manager, AWS Secrets Manager). Revoke a key immediately from <Link href="/settings/api-keys" style={{ color: '#92350f' }}>Settings → API Keys</Link> if you suspect it has been compromised.
        </div>

        <h3 style={subHeading}>HTTP response codes</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Meaning</th>
                <th style={th}>Likely cause</th>
              </tr>
            </thead>
            <tbody>
              {[
                { code: '200 OK',              meaning: 'Request succeeded',             cause: 'Normal response' },
                { code: '400 Bad Request',     meaning: 'Missing or invalid parameter',  cause: 'Required field absent or wrong type' },
                { code: '401 Unauthorized',    meaning: 'Invalid or missing API key',    cause: 'Key not provided, revoked, or expired' },
                { code: '402 Payment Required',meaning: 'Usage limit exceeded',          cause: 'Tenant is over their plan limit; contact your account manager to upgrade' },
                { code: '409 Conflict',        meaning: 'Duplicate file detected',       cause: 'A file with the same SHA-256 hash has already been submitted; see existingJobId in response' },
                { code: '500 Server Error',    meaning: 'Internal platform error',       cause: 'Contact Mysoft support with the Job ID if available' },
              ].map((row) => (
                <tr key={row.code}>
                  <td style={tdCode}>{row.code}</td>
                  <td style={td}>{row.meaning}</td>
                  <td style={td}>{row.cause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Endpoints ── */}
      <div style={card}>
        <h2 style={{ ...sectionHeading, fontSize: 18 }}>API Endpoints</h2>

        {/* POST /api/v1/ingest/check */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/ingest/check</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>Pre-flight check</strong> — verify that a file has not been submitted before and that the tenant is within their usage limits, <em>without</em> uploading the file. Run this before transferring large files to avoid a wasted upload.
          </p>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Request body (JSON):</p>
          <div style={codeBlock}>
{`{
  "sha256": "e3b0c44298fc1c149afbf4c8996fb924...",  // SHA-256 hex digest of the file
  "filename": "payroll_march_2026.csv"
}`}
          </div>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Responses:</p>
          <div style={codeBlock}>
{`// File is new and usage is within limits — safe to upload
{ "exists": false }

// File already exists — skip upload, reference the existing job
{ "exists": true, "jobId": "uuid", "status": "completed", "processedAt": "ISO8601" }

// Usage limit exceeded — 402 status
{ "error": "Monthly job limit reached", "overLimit": true }`}
          </div>
        </div>

        {/* POST /api/v1/ingest */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/ingest</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>Submit a file for processing</strong> — uploads the file and creates an <code style={{ fontFamily: 'monospace', fontSize: 12 }}>upload_job</code>. If a <code style={{ fontFamily: 'monospace', fontSize: 12 }}>mappingId</code> or <code style={{ fontFamily: 'monospace', fontSize: 12 }}>watcherConfigId</code> with <code style={{ fontFamily: 'monospace', fontSize: 12 }}>auto_process: true</code> is supplied, processing is triggered immediately (fire-and-forget — the response returns before Intacct finishes).
          </p>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Request — multipart/form-data:</p>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Field</th>
                  <th style={th}>Type</th>
                  <th style={th}>Required</th>
                  <th style={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { field: 'file',            type: 'File',   req: true,  desc: 'The CSV or XLSX file to submit' },
                  { field: 'filename',        type: 'string', req: true,  desc: 'Original filename (used for display and storage path)' },
                  { field: 'sha256',          type: 'string', req: true,  desc: 'SHA-256 hex digest of the file — used for deduplication' },
                  { field: 'mappingId',       type: 'string', req: false, desc: 'UUID of the field mapping to use; triggers auto-processing' },
                  { field: 'watcherConfigId', type: 'string', req: false, desc: 'UUID of the watcher config (sets mapping + auto-process from config)' },
                  { field: 'sourceType',      type: 'string', req: false, desc: 'agent (default) or sftp_poll' },
                ].map((row) => (
                  <tr key={row.field}>
                    <td style={tdCode}>{row.field}</td>
                    <td style={tdCode}>{row.type}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{row.req ? '✅' : ''}</td>
                    <td style={td}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Example (curl):</p>
          <div style={codeBlock}>
{`sha256=$(sha256sum payroll.csv | awk '{print $1}')

curl -X POST https://app.mysoft-integration.com/api/v1/ingest \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx" \\
  -F "file=@payroll.csv" \\
  -F "filename=payroll.csv" \\
  -F "sha256=$sha256" \\
  -F "mappingId=3f2e1d00-..."`}
          </div>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Response:</p>
          <div style={codeBlock}>
{`// Queued (no mapping provided)
{ "jobId": "uuid", "status": "pending", "autoProcess": false }

// Processing triggered
{ "jobId": "uuid", "status": "processing", "autoProcess": true }

// Duplicate — 409 status
{ "error": "Duplicate file", "jobId": "uuid", "status": "completed" }`}
          </div>
        </div>

        {/* GET /api/v1/jobs/{id}/status */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>GET</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/jobs/{'{id}'}/status</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>Poll job status</strong> — returns the current processing state and row counts for a job. Use this to determine when a job has finished.
          </p>
          <div style={codeBlock}>
{`curl https://app.mysoft-integration.com/api/v1/jobs/UUID/status \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx"`}
          </div>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Response:</p>
          <div style={codeBlock}>
{`{
  "jobId": "uuid",
  "status": "completed",          // pending | processing | completed | completed_with_errors | failed | awaiting_approval
  "rowsProcessed": 142,
  "rowsErrored": 3,
  "createdAt": "2026-03-18T09:00:00Z",
  "updatedAt": "2026-03-18T09:00:47Z"
}`}
          </div>
          <div style={infoBox}>
            <strong>Recommended polling interval:</strong> wait 5 seconds before the first poll, then poll every 10 seconds. Most jobs complete in under 60 seconds. Stop polling once <code style={{ fontFamily: 'monospace', fontSize: 12 }}>status</code> is one of: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed_with_errors</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>failed</code>.
          </div>
        </div>

        {/* GET /api/v1/config */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>GET</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/config</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>Fetch watcher configurations</strong> — returns all enabled watcher configs for the tenant. Used by the Windows Agent on startup to load its watch definitions without requiring a local config file.
          </p>
          <div style={codeBlock}>
{`curl https://app.mysoft-integration.com/api/v1/config \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx"`}
          </div>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Response:</p>
          <div style={codeBlock}>
{`{
  "watchers": [
    {
      "id": "uuid",
      "name": "Payroll Export Folder",
      "sourceType": "folder",
      "folderPath": "C:\\\\IntacctExports\\\\Payroll",
      "filePattern": "*.csv",
      "mappingId": "uuid",
      "archiveAction": "move",
      "archiveFolder": "C:\\\\IntacctExports\\\\Archive",
      "pollInterval": 60,
      "autoProcess": true
    }
  ]
}`}
          </div>
        </div>

        {/* POST /api/v1/heartbeat */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/heartbeat</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>Agent heartbeat</strong> — sent by the Windows Agent every 5 minutes to signal it is running. Updates <code style={{ fontFamily: 'monospace', fontSize: 12 }}>last_used_at</code> on the API key, which drives the <strong>Online / Idle / Offline</strong> status shown in Platform → Tenants → [Tenant] → Details.
          </p>
          <div style={codeBlock}>
{`curl -X POST https://app.mysoft-integration.com/api/v1/heartbeat \\
  -H "Authorization: Bearer mip_live_xxxxxxxxxxxx"

// Response
{ "ok": true }`}
          </div>
        </div>

        {/* POST /api/v1/push/:token */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: 'monospace', color: '#111' }}>/api/v1/push/:token</code>
          </div>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            <strong>HTTP push receiver</strong> — allows external systems (ERP exports, iPaaS platforms, custom scripts) to deliver a file directly to the platform without requiring the Windows Agent or SFTP credentials. Each watcher configured with source type <em>HTTP Push</em> has a unique <code style={{ fontFamily: 'monospace', fontSize: 12 }}>token</code> in its URL; this token is its authentication credential — keep it secret.
          </p>
          <p style={{ ...bodyText, marginBottom: 8 }}>
            The server computes the SHA-256 hash server-side — you do not need to pre-compute it. If the file has been seen before (same hash for the same tenant) a <code style={{ fontFamily: 'monospace', fontSize: 12 }}>409</code> is returned and no new job is created.
          </p>
          <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Request — multipart/form-data:</p>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Field</th><th style={th}>Required</th><th style={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdCode}>file</td><td style={td}>✓</td><td style={td}>The file to ingest (multipart binary)</td></tr>
                <tr><td style={tdCode}>filename</td><td style={td}>—</td><td style={td}>Override filename — defaults to the file field&apos;s name attribute</td></tr>
              </tbody>
            </table>
          </div>
          <div style={codeBlock}>
{`# Push a CSV file to a specific watcher
curl -X POST https://app.mysoft-integration.com/api/v1/push/YOUR_PUSH_TOKEN \\
  -F "file=@/path/to/export.csv"

// Success (file accepted and queued)
{ "jobId": "uuid", "status": "pending", "autoProcess": false }

// Success with auto-process enabled on the watcher
{ "jobId": "uuid", "status": "processing", "autoProcess": true }

// Duplicate — already ingested (409)
{ "isDuplicate": true, "jobId": "uuid", "status": "completed" }

// File pattern mismatch (422)
{ "error": "Filename does not match required pattern: *.csv" }`}
          </div>
          <p style={{ ...bodyText, fontSize: 12, color: '#555', marginTop: 8 }}>
            <strong>Finding your push URL:</strong> Go to <Link href="/settings/watchers" style={{ color: '#00A3E0' }}>Settings → Watchers</Link>, edit an HTTP Push watcher, and the full push URL is shown in Step 2. It has the form <code style={{ fontFamily: 'monospace', fontSize: 11 }}>https://…/api/v1/push/&lt;uuid&gt;</code>.
          </p>
        </div>
      </div>

      {/* ── Connectors ── */}
      <div style={card}>
        <h2 style={{ ...sectionHeading, fontSize: 18 }}>File Connectors</h2>
        <p style={bodyText}>
          The platform provides three source types for automated file ingestion. All are configured under <Link href="/settings/watchers" style={{ color: '#00A3E0' }}>Settings → Watchers</Link>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Windows Agent */}
          <div style={{ background: '#FFFBF0', border: '1px solid #F5D98C', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7A5100', marginBottom: 6 }}>⚙ Windows Agent (local_folder)</div>
            <p style={{ ...bodyText, color: '#7A5100', marginBottom: 8 }}>A background service installed on a Windows server or PC. It polls a local folder and pushes files to the platform via <code style={{ fontFamily: 'monospace', fontSize: 12 }}>POST /api/v1/ingest</code> authenticated with a tenant API key. Pre-flight duplicate checking via <code style={{ fontFamily: 'monospace', fontSize: 12 }}>POST /api/v1/check</code> and heartbeat reporting via <code style={{ fontFamily: 'monospace', fontSize: 12 }}>POST /api/v1/heartbeat</code>.</p>
            <p style={{ ...bodyText, color: '#7A5100', margin: 0, fontSize: 12 }}>Config downloaded by agent at startup from <code style={{ fontFamily: 'monospace', fontSize: 11 }}>GET /api/v1/config</code>. No manual config file editing required.</p>
          </div>

          {/* SFTP */}
          <div style={{ background: '#EEF7FF', border: '1px solid #A3CFFF', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0A4F92', marginBottom: 6 }}>☁ SFTP Connector (sftp)</div>
            <p style={{ ...bodyText, color: '#0A4F92', marginBottom: 8 }}>The platform polls your SFTP server every 5 minutes (respecting each watcher&apos;s configured poll interval). No software installation required — just a reachable SFTP host, username, and password. The SFTP password is stored encrypted (AES-256-GCM) using the platform credential key.</p>
            <p style={{ ...bodyText, color: '#0A4F92', margin: 0, fontSize: 12 }}>
              After ingestion: files can be <strong>left in place</strong>, <strong>deleted</strong>, or <strong>moved to an archive folder</strong> on the SFTP server — configured per watcher. Duplicate detection is SHA-256 based; a file that has been seen before (same content) will be skipped even if the filename changes.
            </p>
          </div>

          {/* HTTP Push */}
          <div style={{ background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0E5C30', marginBottom: 6 }}>⬆ HTTP Push Receiver (http_push)</div>
            <p style={{ ...bodyText, color: '#0E5C30', marginBottom: 8 }}>External systems POST files directly to a per-watcher URL. No polling — files are ingested the moment they are received. Authentication is provided by the push token embedded in the URL (treat it as a secret). The server computes SHA-256 server-side.</p>
            <p style={{ ...bodyText, color: '#0E5C30', margin: 0, fontSize: 12 }}>
              Endpoint: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>POST /api/v1/push/&#123;push_token&#125;</code> — see the API reference above for request/response details.
            </p>
          </div>
        </div>
      </div>

      {/* ── Webhooks ── */}
      <div style={card}>
        <h2 style={{ ...sectionHeading, fontSize: 18 }}>Webhooks</h2>
        <p style={bodyText}>
          Webhooks allow the platform to push real-time notifications to your own systems when jobs complete or fail, removing the need to poll the status endpoint.
        </p>

        <h3 style={subHeading}>Setting up a webhook endpoint</h3>
        <ol style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Navigate to <Link href="/settings/webhooks" style={{ color: '#00A3E0' }}>Settings → Webhooks</Link>.</li>
          <li style={{ marginBottom: 8 }}>Click <strong>Add Webhook</strong> and enter your endpoint URL (must be HTTPS).</li>
          <li style={{ marginBottom: 8 }}>Select the events to subscribe to: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>job.completed</code> and/or <code style={{ fontFamily: 'monospace', fontSize: 12 }}>job.failed</code>.</li>
          <li style={{ marginBottom: 8 }}>Optionally enter a <strong>signing secret</strong> — the platform uses this to sign all outbound webhook payloads so you can verify they came from Mysoft (strongly recommended).</li>
          <li style={{ marginBottom: 8 }}>Save and test the endpoint from the Webhooks settings page.</li>
        </ol>

        <div style={callout}>
          <strong>Plan requirement:</strong> Webhooks are available on the <strong>Professional</strong> and <strong>Enterprise</strong> plans. The Webhooks tab is hidden on Free and Starter plans.
        </div>

        <h3 style={subHeading}>Webhook events</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Event</th>
                <th style={th}>When fired</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdCode}>job.completed</td>
                <td style={td}>Job finishes with status <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed</code> or <code style={{ fontFamily: 'monospace', fontSize: 12 }}>completed_with_errors</code></td>
              </tr>
              <tr>
                <td style={tdCode}>job.failed</td>
                <td style={td}>Job finishes with status <code style={{ fontFamily: 'monospace', fontSize: 12 }}>failed</code> — unrecoverable error during processing</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Payload structure</h3>
        <p style={bodyText}>All webhook calls are HTTP <strong>POST</strong> requests with a JSON body and <code style={{ fontFamily: 'monospace', fontSize: 12 }}>Content-Type: application/json</code>:</p>
        <div style={codeBlock}>
{`{
  "event": "job.completed",
  "jobId": "3f2e1d00-0000-0000-0000-000000000000",
  "tenantId": "a1b2c3d4-...",
  "status": "completed",
  "filename": "payroll_march_2026.csv",
  "processedCount": 142,
  "errorCount": 0,
  "recordNos": ["2699", "2700", "2701"],    // Intacct RECORDNOs (empty on failure)
  "errorMessage": null,                      // Populated for job.failed events
  "timestamp": "2026-03-18T09:00:47.123Z"
}`}
        </div>

        <h3 style={subHeading}>Verifying the signature</h3>
        <p style={bodyText}>
          When a signing secret is configured, the platform includes an <code style={{ fontFamily: 'monospace', fontSize: 12 }}>X-Mysoft-Signature</code> header with every request. The value is <code style={{ fontFamily: 'monospace', fontSize: 12 }}>sha256=&lt;HMAC-SHA256 hex digest&gt;</code> of the raw JSON body, computed using your signing secret.
        </p>
        <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Verification — Node.js:</p>
        <div style={codeBlock}>
{`import crypto from 'crypto';

function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Express / Next.js Route Handler example
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get('x-mysoft-signature') ?? '';

  if (!verifyWebhook(rawBody, sig, process.env.WEBHOOK_SECRET!)) {
    return new Response('Forbidden', { status: 403 });
  }

  const payload = JSON.parse(rawBody);
  console.log('Received event:', payload.event, 'jobId:', payload.jobId);
  // ... handle event ...
  return new Response('OK');
}`}
        </div>
        <p style={{ ...bodyText, fontWeight: 600, marginBottom: 4 }}>Verification — Python:</p>
        <div style={codeBlock}>
{`import hmac, hashlib

def verify_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# Flask example
@app.route('/webhook', methods=['POST'])
def handle_webhook():
    sig = request.headers.get('X-Mysoft-Signature', '')
    if not verify_webhook(request.data, sig, WEBHOOK_SECRET):
        return 'Forbidden', 403
    payload = request.get_json()
    # ... handle event ...
    return 'OK'`}
        </div>

        <div style={callout}>
          <strong>Important:</strong> Always verify the signature before processing the payload. Always use <code style={{ fontFamily: 'monospace', fontSize: 12 }}>timingSafeEqual</code> / <code style={{ fontFamily: 'monospace', fontSize: 12 }}>hmac.compare_digest</code> — never a plain string comparison — to prevent timing attacks.
        </div>

        <h3 style={subHeading}>Delivery and retries</h3>
        <ul style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Webhooks have a <strong>10-second timeout</strong>. Your endpoint must return a 2xx status within this window.</li>
          <li style={{ marginBottom: 8 }}>Delivery is <strong>best-effort</strong> — the platform records the last HTTP status code and any error on the webhook endpoint record, visible in Settings → Webhooks.</li>
          <li style={{ marginBottom: 8 }}>If your endpoint is temporarily unavailable, the delivery will fail silently. Design your systems to be idempotent and resilient to missed events. You can always query job status via the API as a fallback.</li>
          <li style={{ marginBottom: 8 }}>There are currently no automatic retries. <RoadmapBadge /> Retry-with-backoff is planned for a future release.</li>
        </ul>
      </div>

      {/* ── Roadmap ── */}
      <div style={card}>
        <h2 style={{ ...sectionHeading, fontSize: 18 }}>Upcoming API Features <RoadmapBadge /></h2>
        <p style={bodyText}>
          The following capabilities are on the product roadmap. They are <strong>not yet available</strong> and are listed here for planning purposes only. Dates are indicative and subject to change — contact your account manager for the latest status.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              title: 'SharePoint folder polling',
              desc: 'Monitor a SharePoint document library for new files and ingest them automatically. Requires an Azure AD app registration.',
            },
            {
              title: 'Webhook retry with backoff',
              desc: 'Automatic retry of failed webhook deliveries with exponential backoff — up to 3 attempts over 24 hours.',
            },
            {
              title: 'GET /api/v1/jobs — job listing endpoint',
              desc: 'Retrieve a paginated list of recent jobs for your tenant, with status filtering. Currently only individual job status is available via the API.',
            },
            {
              title: 'Sage X3 integration target',
              desc: 'A second integration target alongside Sage Intacct — post transactions directly to Sage X3 using the X3 Web Services API.',
            },
            {
              title: 'Self-service onboarding wizard',
              desc: 'A guided setup flow that allows new tenants to configure their Intacct credentials, run a connection test, upload a sample file, select a mapping, and complete a dry-run submission — without requiring a Mysoft implementation consultant.',
            },
          ].map((item) => (
            <div key={item.title} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid #e8eaed' }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                <span style={{ fontSize: 15 }}>🗓</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>
                  {item.title}
                  <RoadmapBadge />
                </div>
                <p style={{ ...bodyText, margin: 0 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

// ── Section: Platform Administration ────────────────────────────────────────

function SectionPlatformAdmin() {
  return (
    <section id="platform-admin" style={{ scrollMarginTop: 24 }}>
      <div style={card}>
        <h2 style={sectionHeading}>⚙️ Platform Administration</h2>
        <p style={bodyText}>
          Platform Administration screens are available exclusively to <code style={{ fontFamily: 'monospace', fontSize: 12 }}>platform_super_admin</code> and <code style={{ fontFamily: 'monospace', fontSize: 12 }}>mysoft_support_admin</code> roles. These tools allow you to configure platform-wide settings, monitor job queues, manage tenant connector licences, and view health status.
        </p>

        <h3 style={subHeading}>Platform Settings (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>/platform/settings</code>)</h3>
        <p style={bodyText}>
          The Platform Settings page contains five configurable sections:
        </p>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Section</th>
                <th style={th}>Key settings</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Intacct Sender Credentials</td>
                <td style={td}>Platform-level Web Services sender ID and password used as fallback credentials.</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Health Check Thresholds</td>
                <td style={td}>DLQ threshold (default 10 jobs), error rate % (default 50%), agent offline window (default 15 min). Changes take effect immediately at <code style={{ fontFamily: 'monospace', fontSize: 12 }}>/api/health</code>.</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Email &amp; Notifications</td>
                <td style={td}>Support address shown in all outgoing system emails.</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Job Processing</td>
                <td style={td}>Default Intacct supdoc folder name used when no per-job folder is specified. Users &amp; Invites: invite link TTL in days.</td>
              </tr>
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>SFTP Watcher Defaults</td>
                <td style={td}>Global default connection timeout (ms) and retry count. Per-watcher configuration overrides these values.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={subHeading}>Job Queue &amp; Dead-Letter Queue (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>/platform/jobs</code>)</h3>
        <p style={bodyText}>
          The Jobs screen gives a real-time overview of queue health across the platform.
        </p>
        <ul style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}><strong>Queue depth cards</strong> — counts for Processing, Queued, Pending, Retry, Failed, and DLQ statuses.</li>
          <li style={{ marginBottom: 8 }}><strong>DLQ table</strong> — jobs that have exhausted all retry attempts. Displays job ID, tenant, filename, and last error message.</li>
          <li style={{ marginBottom: 8 }}><strong>Retry button</strong> — re-queues a DLQ job: resets the attempt count and sets status back to <code style={{ fontFamily: 'monospace', fontSize: 12 }}>queued</code> so the normal processing pipeline picks it up.</li>
          <li style={{ marginBottom: 8 }}><strong>Active jobs table</strong> — currently processing or queued jobs across all tenants.</li>
          <li style={{ marginBottom: 8 }}><strong>Recent failures table</strong> — the last 20 failed jobs across the platform, useful for diagnosing systemic issues.</li>
        </ul>
        <div style={infoBox}>
          <strong>DLQ retries go back to the normal queue.</strong> When you click Retry on a DLQ job, the job is placed back into the standard processing queue — it does not jump to the front. Monitor the Active jobs table to confirm it is picked up.
        </div>

        <h3 style={subHeading}>Health Monitoring (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>/api/health</code>)</h3>
        <p style={bodyText}>
          A public <strong>GET</strong> endpoint that returns a JSON health summary suitable for external uptime monitors (UptimeRobot, Pingdom, etc.).
        </p>
        <p style={{ ...bodyText, marginBottom: 4 }}><strong>Response shape:</strong></p>
        <div style={codeBlock}>
{`{
  "status": "ok" | "degraded" | "unhealthy",
  "timestamp": "2026-03-21T09:00:00.000Z",
  "checks": {
    "database": { "status": "ok" },
    "jobQueueDlq": { "status": "ok", "dlqCount": 2, "threshold": 10 },
    "errorRate": { "status": "ok", "rate": 3.2, "threshold": 50 },
    "agentHeartbeat": { "status": "ok", "lastSeenMinutesAgo": 4, "threshold": 15 }
  }
}`}
        </div>
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Overall status</th>
                <th style={th}>HTTP code</th>
                <th style={th}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdCode}>ok</td>
                <td style={td}>200</td>
                <td style={td}>All checks passing within configured thresholds.</td>
              </tr>
              <tr>
                <td style={tdCode}>degraded</td>
                <td style={td}>200</td>
                <td style={td}>One or more checks are at warning level but the platform is still operational.</td>
              </tr>
              <tr>
                <td style={tdCode}>unhealthy</td>
                <td style={td}>503</td>
                <td style={td}>A critical check has failed — database unreachable, DLQ or error rate threshold breached, or agent offline.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={infoBox}>
          Health check thresholds (DLQ depth, error rate %, agent offline window) are configurable in <strong>Platform Settings</strong>. Changes take effect immediately — no restart required.
        </div>

        <h3 style={subHeading}>Connector Licensing (<code style={{ fontFamily: 'monospace', fontSize: 12 }}>/platform/connectors</code>)</h3>
        <p style={bodyText}>
          Platform admins assign connector licences to tenants from the Platform → Connectors screen. Each connector licence grants a tenant access to a specific integration (e.g. Sage Intacct).
        </p>
        <ul style={{ ...bodyText, paddingLeft: 20 }}>
          <li style={{ marginBottom: 8 }}>Tenants without a valid licence for a connector <strong>cannot submit jobs</strong> for that connector — the upload page will show an error.</li>
          <li style={{ marginBottom: 8 }}>Licences can have an optional expiry date. Expired licences are treated as revoked.</li>
          <li style={{ marginBottom: 8 }}>Licence assignment, expiry date, and revocation are all managed from the Platform → Connectors screen.</li>
        </ul>

        <h3 style={subHeading}>Tenant Home Region</h3>
        <p style={bodyText}>
          Every tenant is assigned a <strong>home region</strong> (UK, US, or EU) at creation time. The home region governs data residency — all jobs, attachments, and processing records are associated with the tenant&apos;s home region.
        </p>
        <div style={{
          background: '#fffbeb',
          border: '1px solid #f59e0b',
          borderRadius: 6,
          padding: '12px 16px',
          fontSize: 14,
          color: '#78350f',
          marginBottom: 16,
        }}>
          <strong>Home region is immutable.</strong> A tenant&apos;s home region cannot be changed through normal settings. Region changes require a formal managed migration process — contact platform support to initiate a migration.
        </div>
        <p style={bodyText}>
          When creating a new tenant, choose the region carefully based on where the customer&apos;s data must reside. Once set, the region cannot be altered without a full data migration.
        </p>
      </div>
    </section>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function HelpCentre({ role, hasCredentials, hasMapping, hasJob, initialSection }: HelpCentreProps) {
  const isAdmin = role === 'tenant_admin' || role === 'platform_super_admin' || role === 'mysoft_support_admin';
  const isPlatformAdmin = role === 'platform_super_admin' || role === 'mysoft_support_admin';

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.platformAdminOnly) return isPlatformAdmin;
    if (item.adminOnly) return isAdmin;
    return true;
  });

  const [activeSection, setActiveSection] = useState<string>(
    initialSection ?? visibleNav[0]?.id ?? 'uploading-files'
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Scroll to initial section on mount
  useEffect(() => {
    if (initialSection && !scrolled.current) {
      scrolled.current = true;
      const el = document.getElementById(initialSection);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [initialSection]);

  // IntersectionObserver to update active nav item as user scrolls
  useEffect(() => {
    const sectionIds = visibleNav.map((n) => n.id);
    const observers: IntersectionObserver[] = [];

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      }
    };

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(handleIntersect, {
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      });
      obs.observe(el);
      observers.push(obs);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [visibleNav]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <nav
        style={{
          width: 240,
          flexShrink: 0,
          background: '#0B1929',
          overflowY: 'auto',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)',
          padding: '0 16px 12px',
        }}>
          Help Centre
        </div>
        {visibleNav.map((item) => {
          const isActive = activeSection === item.id;
          const showBadge = item.id === 'getting-started' && !hasCredentials;

          return (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 16px',
                background: isActive ? 'rgba(0,163,224,0.18)' : 'transparent',
                color: isActive ? '#00A3E0' : 'rgba(255,255,255,0.65)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                borderLeft: isActive ? '3px solid #00A3E0' : '3px solid transparent',
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {showBadge && (
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#f97316',
                  flexShrink: 0,
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Content area */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 32px',
          background: '#f7f9fb',
        }}
      >
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          {/* Page title */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0B1929', margin: 0, letterSpacing: -0.5 }}>
              Help Centre
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>
              Documentation, guides, and troubleshooting for the Mysoft Integration Platform.
            </p>
          </div>

          {/* Sections */}
          {isAdmin && (
            <SectionGettingStarted
              hasCredentials={hasCredentials}
              hasMapping={hasMapping}
              hasJob={hasJob}
            />
          )}

          <SectionUploadingFiles />
          <SectionJobHistory />
          <SectionAutomatedIngestion />
          <SectionCsvFormat />
          <SectionIntacctSetup />
          <SectionTroubleshooting />
          <SectionRolesPermissions />
          <SectionApprovalWorkflow />
          <SectionUsagePlans />
          <SectionNewFormats />
          {isAdmin && <SectionDeveloper />}
          {isPlatformAdmin && <SectionPlatformAdmin />}

          <div style={{ height: 48 }} />
        </div>
      </div>
    </div>
  );
}
