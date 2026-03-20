'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { createWatcher, updateWatcher } from '@/lib/actions/watchers';
import { testSftpConnection } from '@/lib/actions/sftp-test';
import type { SftpTestState } from '@/lib/actions/sftp-test';
import type { WatcherFormState, WatcherConfig } from '@/lib/actions/watchers';
import EntityIdSelect from '@/components/entity/EntityIdSelect';

interface MappingOption {
  id: string;
  name: string;
}

interface Props {
  watcher?: WatcherConfig;
  mappings: MappingOption[];
}

const initialState: WatcherFormState = { success: false };

export default function WatcherForm({ watcher, mappings }: Props) {
  const isEdit = !!watcher;

  const action = isEdit
    ? updateWatcher.bind(null, watcher.id)
    : createWatcher;

  const [state, formAction, isPending] = useActionState(action, initialState);
  const [sftpTestState, setSftpTestState] = useState<SftpTestState>({});
  const [sftpTestPending, startSftpTest] = useTransition();

  function handleSftpTest() {
    const get = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
    const fd = new FormData();
    fd.set('sftp_host', get('sftp_host'));
    fd.set('sftp_port', get('sftp_port') || '22');
    fd.set('sftp_username', get('sftp_username'));
    fd.set('sftp_password', get('sftp_password'));
    fd.set('sftp_remote_path', get('sftp_remote_path'));
    startSftpTest(async () => {
      const result = await testSftpConnection({}, fd);
      setSftpTestState(result);
    });
  }

  const [sourceType, setSourceType] = useState<'local_folder' | 'sftp' | 'http_push'>(
    watcher?.source_type ?? 'local_folder'
  );

  // Build push URL client-side — safe because this is a 'use client' component
  const pushUrl = watcher?.push_token && typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/push/${watcher.push_token}`
    : null;

  const [urlCopied, setUrlCopied] = useState(false);
  const handleCopyUrl = () => {
    const url = pushUrl ?? (watcher?.push_token ? `/api/v1/push/${watcher.push_token}` : '');
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };
  const [archiveAction, setArchiveAction] = useState<'move' | 'delete' | 'leave'>(
    watcher?.archive_action ?? 'leave'
  );
  const [entityIdOverride, setEntityIdOverride] = useState(watcher?.entity_id_override ?? '');

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings/watchers" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Watchers
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: '8px 0 4px' }}>
          {isEdit ? 'Edit Watcher' : 'New Watcher'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          {isEdit ? `Editing: ${watcher.name}` : 'Configure a new file watcher to automatically ingest files.'}
        </p>
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      <form action={formAction}>
        {/* Step 1 — Identity */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Step 1 — Identity</div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="name">Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={watcher?.name ?? ''}
              required
              placeholder="e.g. Daily Sales Import"
              style={inputStyle}
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="source_type">Source Type *</label>
            <select
              id="source_type"
              name="source_type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'local_folder' | 'sftp' | 'http_push')}
              style={inputStyle}
            >
              <option value="local_folder">Windows Agent (Local Folder)</option>
              <option value="sftp">SFTP (Cloud — no install required)</option>
              <option value="http_push">HTTP Push (external system pushes files)</option>
            </select>
          </div>

          {/* Contextual callout explaining the selected type */}
          {sourceType === 'local_folder' && (
            <div style={calloutAmberStyle}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>⚙ Requires the Mysoft Windows Agent</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                The Windows Agent runs as a background service on your own Windows server or PC. It watches the folder path below and automatically pushes new files to this platform via the API. The agent must be installed and running for this watcher to function.
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                The <strong>folder path, file pattern, and poll interval</strong> you configure here are downloaded by the agent at startup — you do not need to edit config files on the machine.
              </div>
            </div>
          )}
          {sourceType === 'sftp' && (
            <div style={calloutBlueStyle}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>☁ Cloud-native — no software to install</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                This platform connects directly to your SFTP server and polls it on a schedule. No agent or software is needed on your machines — just a reachable SFTP host and valid credentials.
              </div>
            </div>
          )}
          {sourceType === 'http_push' && (
            <div style={calloutGreenStyle}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>⬆ HTTP Push — external system delivers files</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                A unique push URL is generated for this watcher. Any system that can make an HTTP POST request (e.g. an ERP export script, an iPaaS, or a custom integration) can deliver files directly — no agent or polling required.
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                The push URL acts as its own authentication token. Keep it secret. POST multipart/form-data with a <code style={{ fontFamily: 'monospace' }}>file</code> field.
              </div>
            </div>
          )}
        </div>

        {/* Step 2a — Local Folder (Agent) */}
        {sourceType === 'local_folder' && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Step 2 — Folder Location</div>
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="folder_path">Folder Path *</label>
              <input
                id="folder_path"
                name="folder_path"
                type="text"
                defaultValue={watcher?.folder_path ?? ''}
                placeholder="e.g. C:\Imports\Sales"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                The path on the machine where the Windows Agent is running, not a path on this server.
              </div>
            </div>
          </div>
        )}

        {/* Step 2b — SFTP */}
        {sourceType === 'sftp' && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Step 2 — SFTP Connection</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 14 }}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="sftp_host">Host *</label>
                <input
                  id="sftp_host"
                  name="sftp_host"
                  type="text"
                  defaultValue={watcher?.sftp_host ?? ''}
                  placeholder="sftp.example.com"
                  style={inputStyle}
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="sftp_port">Port</label>
                <input
                  id="sftp_port"
                  name="sftp_port"
                  type="number"
                  defaultValue={watcher?.sftp_port ?? 22}
                  min={1}
                  max={65535}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="sftp_username">Username *</label>
              <input
                id="sftp_username"
                name="sftp_username"
                type="text"
                defaultValue={watcher?.sftp_username ?? ''}
                autoComplete="username"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="sftp_password">
                Password {isEdit ? <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>(leave blank to keep current)</span> : '*'}
              </label>
              <input
                id="sftp_password"
                name="sftp_password"
                type="password"
                autoComplete="new-password"
                placeholder={isEdit ? '••••••••' : ''}
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="sftp_remote_path">Remote Path *</label>
              <input
                id="sftp_remote_path"
                name="sftp_remote_path"
                type="text"
                defaultValue={watcher?.sftp_remote_path ?? ''}
                placeholder="/uploads/incoming"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                The directory on your SFTP server to poll for new files.
              </div>
            </div>

            {/* SFTP test result */}
            {sftpTestState.success && (
              <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30', marginBottom: 10 }}>
                ✓ SFTP connection successful — credentials and path are valid.
              </div>
            )}
            {sftpTestState.error && (
              <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E', marginBottom: 10 }}>
                <strong>SFTP test failed:</strong> {sftpTestState.error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSftpTest}
              disabled={sftpTestPending || isPending}
              style={{
                background: sftpTestPending ? '#B0C8D8' : '#F0F7FF',
                color: sftpTestPending ? '#fff' : 'var(--blue)',
                border: '1px solid var(--blue)',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: sftpTestPending || isPending ? 'not-allowed' : 'pointer',
                marginTop: 4,
              }}
            >
              {sftpTestPending ? 'Testing…' : '⚡ Test SFTP Connection'}
            </button>
          </div>
        )}

        {/* Step 2c — HTTP Push URL (edit mode only) */}
        {sourceType === 'http_push' && isEdit && watcher?.push_token && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Step 2 — Push Endpoint URL</div>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Your Push URL</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <code style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  background: '#F0F4F8',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: 'var(--navy)',
                  wordBreak: 'break-all',
                  display: 'block',
                }}>
                  {pushUrl ?? `…/api/v1/push/${watcher.push_token}`}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 500,
                    color: urlCopied ? '#0E5C30' : 'var(--blue)',
                    background: urlCopied ? '#EDFAF3' : '#F0F4F8',
                    border: `1px solid ${urlCopied ? '#A8DFBE' : 'var(--border)'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {urlCopied ? '✓ Copied!' : '⎘ Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                POST multipart/form-data with a <code style={{ fontFamily: 'monospace', fontSize: 11 }}>file</code> field to this URL.
                The URL is the authentication token — treat it as a secret.
                <br />
                Returns <code style={{ fontFamily: 'monospace', fontSize: 11 }}>&#123; jobId, status &#125;</code> on success or <code style={{ fontFamily: 'monospace', fontSize: 11 }}>409</code> on duplicate.
              </div>
            </div>
          </div>
        )}

        {sourceType === 'http_push' && !isEdit && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Step 2 — Push Endpoint URL</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              A unique push URL will be generated automatically when you save this watcher.
              You will see it here when you next edit the watcher configuration.
            </div>
          </div>
        )}

        {/* Step 3 — Processing */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Step 3 — Processing Options</div>

          <div style={{ display: 'grid', gridTemplateColumns: sourceType === 'http_push' ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="file_pattern">File Pattern</label>
              <input
                id="file_pattern"
                name="file_pattern"
                type="text"
                defaultValue={watcher?.file_pattern ?? '*.csv'}
                placeholder="*.csv"
                style={inputStyle}
              />
              {sourceType === 'http_push' && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  If set, files with non-matching names will be rejected with HTTP 422.
                </div>
              )}
            </div>

            {sourceType !== 'http_push' && (
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="poll_interval">
                Poll Interval (seconds)
              </label>
              <input
                id="poll_interval"
                name="poll_interval"
                type="number"
                defaultValue={watcher?.poll_interval ?? 300}
                min={30}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {sourceType === 'sftp'
                  ? 'How often the cloud function checks for new files.'
                  : 'How often the local agent scans the folder.'}
              </div>
            </div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="mapping_id">Field Mapping</label>
            <select
              id="mapping_id"
              name="mapping_id"
              defaultValue={watcher?.mapping_id ?? ''}
              style={inputStyle}
            >
              <option value="">— None (manual selection at processing time) —</option>
              {mappings.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Archive action — local folder (agent) and SFTP only */}
          {(sourceType === 'local_folder' || sourceType === 'sftp') && (
            <>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="archive_action">Archive Action</label>
                <select
                  id="archive_action"
                  name="archive_action"
                  value={archiveAction}
                  onChange={(e) => setArchiveAction(e.target.value as 'move' | 'delete' | 'leave')}
                  style={inputStyle}
                >
                  <option value="leave">Leave in place</option>
                  <option value="move">Move to archive folder</option>
                  <option value="delete">Delete after ingestion</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {sourceType === 'sftp'
                    ? 'What happens to the file on your SFTP server after it has been successfully ingested.'
                    : 'What the agent does with a file after it has been successfully uploaded.'}
                </div>
              </div>

              {archiveAction === 'move' && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle} htmlFor="archive_folder">Archive Folder *</label>
                  <input
                    id="archive_folder"
                    name="archive_folder"
                    type="text"
                    defaultValue={watcher?.archive_folder ?? ''}
                    placeholder="C:\Imports\Archive"
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4 }}>
            <input
              id="auto_process"
              name="auto_process"
              type="checkbox"
              defaultChecked={watcher?.auto_process ?? false}
              style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 1, flexShrink: 0 }}
            />
            <label htmlFor="auto_process" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', fontWeight: 400, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>Auto-process files</span> — submit immediately using the selected mapping above. If no mapping is selected, the job will be created as <em>pending</em> for manual processing.
            </label>
          </div>
        </div>

        {/* Step 4 — Intacct Entity */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Step 4 — Intacct Entity (Multi-entity)</div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="entity_id_override">Entity Override</label>
            {/* Hidden input carries the value into the server action FormData */}
            <input type="hidden" name="entity_id_override" value={entityIdOverride} />
            <EntityIdSelect
              value={entityIdOverride}
              onChange={setEntityIdOverride}
              disabled={isPending}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Overrides the Sage Intacct entity (location) used for <strong>all files</strong> from this watcher.
              Leave blank to use the entity configured on the Intacct credential. Entity IDs can be found
              in Intacct under <strong>General Ledger → Setup → Locations</strong>.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: isPending ? 'var(--muted)' : 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 500,
              cursor: isPending ? 'default' : 'pointer',
            }}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Watcher'}
          </button>
          <Link
            href="/settings/watchers"
            style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '16px 20px',
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--navy)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 14,
};

const fieldGroupStyle: React.CSSProperties = { marginBottom: 14 };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--navy)',
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: '#fff',
  color: 'var(--navy)',
  boxSizing: 'border-box',
};

const calloutAmberStyle: React.CSSProperties = {
  background: '#FFFBF0',
  border: '1px solid #F5D98C',
  borderRadius: 6,
  padding: '12px 14px',
  color: '#7A5100',
  marginTop: 4,
};

const calloutBlueStyle: React.CSSProperties = {
  background: '#EEF7FF',
  border: '1px solid #A3CFFF',
  borderRadius: 6,
  padding: '12px 14px',
  color: '#0A4F92',
  marginTop: 4,
};

const calloutGreenStyle: React.CSSProperties = {
  background: '#EDFAF3',
  border: '1px solid #A8DFBE',
  borderRadius: 6,
  padding: '12px 14px',
  color: '#0E5C30',
  marginTop: 4,
};
