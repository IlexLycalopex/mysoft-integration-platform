'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createUploadJob } from '@/lib/actions/uploads';
import EntityIdSelect from '@/components/entity/EntityIdSelect';

const ACCEPTED = '.csv,.xls,.xlsx';
const ATTACHMENT_ACCEPTED = '.pdf,.png,.jpg,.jpeg,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

type UploadState = 'idle' | 'selected' | 'validating' | 'validated' | 'uploading' | 'creating' | 'done' | 'error';

interface MappingOption { id: string; name: string; transaction_type: string }

interface Props {
  tenantId: string;
  mappings: MappingOption[];
}

type ValidationResult = {
  valid: boolean;
  rowCount: number;
  errors: Array<{ code: string; message: string; rows?: number[]; column?: string }>;
  warnings: Array<{ code: string; message: string; rows?: number[]; column?: string }>;
  balanceGroups?: Array<{
    journalId: string; date: string; description: string;
    totalDebit: number; totalCredit: number; balanced: boolean; rowNumbers: number[];
  }>;
} | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUploader({ tenantId, mappings }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult>(null);
  const [dryRun, setDryRun] = useState(false);
  const [entityIdOverride, setEntityIdOverride] = useState('');
  const [, startTransition] = useTransition();
  const [quotaInfo, setQuotaInfo] = useState<{ rowsUsed: number; rowLimit: number | null } | null>(null);

  // Supporting document state
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [supdocFolderName, setSupdocFolderName] = useState('Mysoft Imports');

  function pickFile(file: File) {
    setErrorMsg(null);
    setValidationResult(null);
    setSelectedMappingId('');

    if (file.size > MAX_BYTES) {
      setErrorMsg('File too large. Maximum size is 50 MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xls', 'xlsx'].includes(ext ?? '')) {
      setErrorMsg('Only CSV and Excel files (.csv, .xls, .xlsx) are supported.');
      return;
    }

    setSelectedFile(file);
    setUploadState('selected');
  }

  function clearSelection() {
    setSelectedFile(null);
    setValidationResult(null);
    setSelectedMappingId('');
    setDryRun(false);
    setEntityIdOverride('');
    setErrorMsg(null);
    setUploadState('idle');
    setAttachmentFile(null);
    setAttachmentError(null);
    setSupdocFolderName('Mysoft Imports');
    if (inputRef.current) inputRef.current.value = '';
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  }

  function pickAttachment(file: File) {
    setAttachmentError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('Attachment too large. Maximum size is 10 MB.');
      return;
    }
    setAttachmentFile(file);
  }

  async function handleValidate() {
    if (!selectedFile || !selectedMappingId) return;
    setUploadState('validating');
    setValidationResult(null);
    setErrorMsg(null);

    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('filename', selectedFile.name);
      fd.append('mappingId', selectedMappingId);

      const res = await fetch('/api/validate', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? 'Validation request failed');
        setUploadState('selected');
        return;
      }
      const result: ValidationResult = await res.json();
      setValidationResult(result);

      // Fetch quota info in parallel — non-blocking if it fails
      fetch('/api/usage/current')
        .then((r) => r.ok ? r.json() : null)
        .then((q) => { if (q) setQuotaInfo(q); })
        .catch(() => {});

      setUploadState('validated');
    } catch {
      setErrorMsg('Validation failed. Please try again.');
      setUploadState('selected');
    }
  }

  async function handleUpload() {
    if (!selectedFile || !selectedMappingId) return;

    const jobId = crypto.randomUUID();
    const storagePath = `${tenantId}/${jobId}/${selectedFile.name}`;

    setUploadState('uploading');
    setProgress(0);

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, selectedFile, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      setUploadState('error');
      setErrorMsg(uploadError.message);
      return;
    }

    // Upload supporting document if selected
    let attachmentStoragePath: string | null = null;
    if (attachmentFile) {
      const attachPath = `${tenantId}/${jobId}/attachments/${attachmentFile.name}`;
      const { error: attachErr } = await supabase.storage
        .from('uploads')
        .upload(attachPath, attachmentFile, { cacheControl: '3600', upsert: false });
      if (attachErr) {
        setUploadState('error');
        setErrorMsg(`Attachment upload failed: ${attachErr.message}`);
        return;
      }
      attachmentStoragePath = attachPath;
    }

    setProgress(100);
    setUploadState('creating');

    const fd = new FormData();
    fd.append('storagePath', storagePath);
    fd.append('filename', selectedFile.name);
    fd.append('fileSize', String(selectedFile.size));
    fd.append('mimeType', selectedFile.type);
    fd.append('mappingId', selectedMappingId);
    if (dryRun) fd.append('dryRun', 'true');
    if (entityIdOverride.trim()) fd.append('entityIdOverride', entityIdOverride.trim());
    if (attachmentStoragePath && attachmentFile) {
      fd.append('attachmentStoragePath', attachmentStoragePath);
      fd.append('attachmentFilename', attachmentFile.name);
      fd.append('attachmentMimeType', attachmentFile.type || 'application/octet-stream');
      fd.append('attachmentFileSize', String(attachmentFile.size));
      fd.append('supdocFolderName', supdocFolderName.trim() || 'Mysoft Imports');
    }

    startTransition(async () => {
      const result = await createUploadJob(undefined as never, fd);
      if (result.error) {
        setUploadState('error');
        setErrorMsg(result.error);
      } else {
        setUploadState('done');
        setTimeout(() => router.push('/jobs'), 1200);
      }
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
    e.target.value = '';
  }

  if (uploadState === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>Upload complete</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Redirecting to job history…</p>
      </div>
    );
  }

  const canClickDropZone = uploadState === 'idle';

  return (
    <div>
      {/* Drop zone — always shown, but clicking only works when idle */}
      <div
        onClick={() => canClickDropZone && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: canClickDropZone ? 'pointer' : 'default',
          background: dragOver ? 'rgba(0,163,224,0.04)' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={onInputChange}
          style={{ display: 'none' }}
        />

        {uploadState === 'idle' && (
          <>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 4px' }}>
              Drop a file here, or{' '}
              <span style={{ color: 'var(--blue)', textDecoration: 'underline' }}>browse</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              CSV, XLS, XLSX · Max 50 MB
            </p>
          </>
        )}

        {(uploadState === 'selected' || uploadState === 'validating' || uploadState === 'validated') && (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            Drop a different file to replace the current selection
          </p>
        )}

        {uploadState === 'uploading' && (
          <>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>Uploading…</p>
            <div style={{ height: 6, background: '#E5EFF5', borderRadius: 3, overflow: 'hidden', maxWidth: 280, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'var(--blue)', width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
          </>
        )}

        {uploadState === 'creating' && (
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>Creating job…</p>
        )}

        {uploadState === 'error' && (
          <p style={{ fontSize: 13, color: 'var(--error)' }}>Upload failed. Try again.</p>
        )}
      </div>

      {/* File selected card */}
      {selectedFile && (uploadState === 'selected' || uploadState === 'validating' || uploadState === 'validated') && (
        <div style={{ marginTop: 16, background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          {/* Header row: filename, size, clear button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{formatBytes(selectedFile.size)}</div>
              </div>
            </div>
            <button
              onClick={clearSelection}
              title="Clear and start over"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }}
            >
              ✕
            </button>
          </div>

          {/* Mapping selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Field mapping
            </label>
            <select
              value={selectedMappingId}
              onChange={(e) => {
                setSelectedMappingId(e.target.value);
                setValidationResult(null);
                if (uploadState === 'validated') setUploadState('selected');
              }}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', minWidth: 240, width: '100%', maxWidth: 360 }}
            >
              <option value="">— select a mapping —</option>
              {mappings.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {mappings.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                No mappings configured. <a href="/settings/integrations" style={{ color: 'var(--blue)' }}>Create one in Settings → Integrations.</a>
              </p>
            )}
          </div>

          {/* Entity ID override (optional — for multi-entity Intacct) */}
          <div style={{ marginBottom: 14, maxWidth: 360 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Intacct Entity <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', textTransform: 'none' }}>(optional — override per file)</span>
            </label>
            <EntityIdSelect
              value={entityIdOverride}
              onChange={setEntityIdOverride}
            />
          </div>

          {/* Supporting document (optional) */}
          <div style={{ marginBottom: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Supporting Document <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', textTransform: 'none' }}>(optional)</span>
            </label>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
              Attach a PDF, image, or document to link to every transaction in this import as an Intacct supporting document.
            </p>

            {attachmentFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0F4F8', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <span style={{ fontSize: 12, color: 'var(--navy)', flex: 1 }}>{attachmentFile.name} <span style={{ color: 'var(--muted)' }}>({formatBytes(attachmentFile.size)})</span></span>
                <button onClick={() => { setAttachmentFile(null); if (attachmentInputRef.current) attachmentInputRef.current.value = ''; }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>✕</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                style={{ fontSize: 12, color: 'var(--blue)', border: '1px dashed var(--border)', borderRadius: 6, padding: '7px 14px', background: 'transparent', cursor: 'pointer' }}
              >
                + Attach a supporting document
              </button>
            )}
            <input
              ref={attachmentInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPTED}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAttachment(f); e.target.value = ''; }}
              style={{ display: 'none' }}
            />

            {attachmentError && (
              <p style={{ fontSize: 12, color: '#DC2626', margin: '4px 0 0' }}>{attachmentError}</p>
            )}

            {/* Intacct folder name */}
            {attachmentFile && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', display: 'block', marginBottom: 4 }}>
                  Intacct Folder
                </label>
                <input
                  type="text"
                  value={supdocFolderName}
                  onChange={(e) => setSupdocFolderName(e.target.value)}
                  placeholder="Mysoft Imports"
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, width: '100%', maxWidth: 260, boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>
                  The Intacct attachment folder where the supdoc will be stored.
                </p>
              </div>
            )}
          </div>

          {/* Validate button */}
          {uploadState !== 'validated' && (
            <button
              onClick={handleValidate}
              disabled={!selectedMappingId || uploadState === 'validating'}
              style={{
                background: !selectedMappingId || uploadState === 'validating' ? '#B0C8D8' : 'var(--blue)',
                color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 18px', fontSize: 13, fontWeight: 600,
                cursor: !selectedMappingId || uploadState === 'validating' ? 'not-allowed' : 'pointer',
              }}
            >
              {uploadState === 'validating' ? 'Validating…' : 'Validate'}
            </button>
          )}

          {/* Validation spinner */}
          {uploadState === 'validating' && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              Validating file…
            </div>
          )}

          {/* Validation results */}
          {uploadState === 'validated' && validationResult && (
            <div style={{ marginTop: 14 }}>
              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9B2B1E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    Errors ({validationResult.errors.length}) — fix these before uploading
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#9B2B1E' }}>
                    {validationResult.errors.map((e, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>
                        {e.message}
                        {e.column && <span style={{ color: '#B03E32', marginLeft: 6 }}>column: {e.column}</span>}
                        {e.rows && e.rows.length > 0 && <span style={{ color: '#B03E32', marginLeft: 6 }}>rows: {e.rows.join(', ')}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92620A', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    Warnings ({validationResult.warnings.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#92620A' }}>
                    {validationResult.warnings.map((w, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>
                        {w.message}
                        {w.column && <span style={{ color: '#A07020', marginLeft: 6 }}>column: {w.column}</span>}
                        {w.rows && w.rows.length > 0 && <span style={{ color: '#A07020', marginLeft: 6 }}>rows: {w.rows.join(', ')}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Success summary */}
              {validationResult.errors.length === 0 && (
                <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A6B30', marginBottom: (validationResult.balanceGroups?.length || quotaInfo) ? 8 : 0 }}>
                    ✓ {validationResult.rowCount} {validationResult.rowCount === 1 ? 'row' : 'rows'} ready to process
                  </div>
                  {quotaInfo && quotaInfo.rowLimit !== null && (
                    <div style={{ fontSize: 12, color: quotaInfo.rowsUsed + validationResult.rowCount > quotaInfo.rowLimit ? '#9B2B1E' : '#1A6B30', marginTop: 4 }}>
                      {quotaInfo.rowsUsed + validationResult.rowCount > quotaInfo.rowLimit
                        ? `⚠ This will exceed your monthly row limit (${(quotaInfo.rowsUsed + validationResult.rowCount).toLocaleString()} / ${quotaInfo.rowLimit.toLocaleString()} rows)`
                        : `Quota: ${(quotaInfo.rowsUsed + validationResult.rowCount).toLocaleString()} / ${quotaInfo.rowLimit.toLocaleString()} rows this month (${Math.round(((quotaInfo.rowsUsed + validationResult.rowCount) / quotaInfo.rowLimit) * 100)}% used)`
                      }
                    </div>
                  )}
                  {validationResult.balanceGroups && validationResult.balanceGroups.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {validationResult.balanceGroups.map((g, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#1A6B30', display: 'flex', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{g.journalId}</span>
                          <span>{g.description}</span>
                          <span style={{ marginLeft: 'auto', fontWeight: 600, color: g.balanced ? '#1A6B30' : '#9B2B1E' }}>
                            {g.balanced ? 'balanced ✓' : 'unbalanced ✕'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Re-validate button (if user changed mapping) */}
              <button
                onClick={() => { setValidationResult(null); setUploadState('selected'); }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', marginRight: 10 }}
              >
                ← Re-validate
              </button>

              {/* Dry run checkbox */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--navy)', cursor: 'pointer', marginRight: 12 }}
                title="Validates the full pipeline without posting to Intacct">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Dry Run
              </label>

              {/* Upload & Process button */}
              {validationResult.errors.length === 0 && (
                <button
                  onClick={handleUpload}
                  style={{
                    background: 'var(--green)',
                    color: '#fff', border: 'none', borderRadius: 6,
                    padding: '8px 18px', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', marginTop: 10, display: 'inline-block',
                  }}
                >
                  {dryRun ? 'Upload & Dry Run' : 'Upload & Process'}
                </button>
              )}

              {/* Upload anyway (warnings only) */}
              {validationResult.errors.length === 0 && validationResult.warnings.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>
                  (uploading despite warnings)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: 12, background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}
