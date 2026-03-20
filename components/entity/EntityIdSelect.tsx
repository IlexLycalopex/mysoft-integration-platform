'use client';

import { useState, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Whether the field is disabled (e.g. form is submitting) */
  disabled?: boolean;
  /** name attribute — only used when rendered inside an uncontrolled form */
  name?: string;
}

// Shape returned by /api/intacct/locations
interface LocationOption {
  id: string;
  name: string;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

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

/**
 * Entity ID selector that attempts to fetch available entities from
 * /api/intacct/locations. Falls back to a plain text input if:
 *  - credentials are not configured
 *  - the API call fails
 *  - the tenant has only one entity (credential default)
 *
 * The API returns { locations: { id: string; name: string }[] }.
 * The `value` and `onChange` always deal in plain ID strings.
 */
export default function EntityIdSelect({ value, onChange, disabled, name }: Props) {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    fetch('/api/intacct/locations')
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { locations?: LocationOption[] };
        // Defensive: filter to entries that are plain objects with an id string
        const locs = (data.locations ?? []).filter(
          (l): l is LocationOption =>
            typeof l === 'object' && l !== null && typeof l.id === 'string' && l.id.length > 0
        );
        setLocations(locs);
        setLoadState('loaded');
      })
      .catch(() => {
        setLoadState('error');
      });
  }, []);

  const showDropdown = loadState === 'loaded' && locations.length > 1;

  if (showDropdown) {
    return (
      <div>
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={inputStyle}
        >
          <option value="">— Credential default —</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.id}{loc.name && loc.name !== loc.id ? ` — ${loc.name}` : ''}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {locations.length} entities loaded from your Intacct account.
          Leave blank to use the credential-level default entity.
        </div>
      </div>
    );
  }

  // Fallback: plain text input (credentials missing, single entity, or load error)
  return (
    <div>
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={
          loadState === 'loading'
            ? 'Loading entities…'
            : 'e.g. ENTITY1 (leave blank for credential default)'
        }
        style={{
          ...inputStyle,
          ...(loadState === 'loading' ? { color: 'var(--muted)', fontStyle: 'italic' } : {}),
        }}
      />
      {loadState === 'error' && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Could not load entities from Intacct — enter an ID manually, or check your credentials in{' '}
          <a href="/settings/integrations" style={{ color: 'var(--blue)' }}>Settings → Integrations</a>.
        </div>
      )}
      {loadState === 'loaded' && locations.length <= 1 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Single-entity Intacct account detected. Leave blank to use the credential default.
        </div>
      )}
    </div>
  );
}
