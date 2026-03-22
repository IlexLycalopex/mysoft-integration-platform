/**
 * Source Connector Interface
 *
 * Source connectors READ data from external accounting systems (Xero, QBO,
 * Sage 50cloud) and produce flat records that feed into the existing
 * field-mapping → Intacct pipeline.
 *
 * This is distinct from the target Connector interface (connector.interface.ts)
 * which WRITES data to endpoint systems.
 */

// ── Capabilities ──────────────────────────────────────────────────────────────

export interface SourceConnectorCapabilities {
  connectorKey: string;
  displayName: string;
  authType: 'oauth2' | 'api_key' | 'basic';
  /** OAuth scopes required (oauth2 only) */
  oauthScopes?: string[];
  /** Object types this connector can fetch */
  supportedObjectTypes: string[];
  /** Whether the connector supports fetching only records changed since a date */
  supportsDeltaSync: boolean;
  supportsHealthCheck: boolean;
}

// ── OAuth tokens ──────────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** When the access token expires */
  expiresAt?: Date;
  /** Provider-specific extras: realm_id (QBO), xero_tenant_id (Xero), etc. */
  extraData?: Record<string, string>;
}

// ── Fetch context ─────────────────────────────────────────────────────────────

export interface FetchContext {
  /** Object type to fetch (e.g. 'xero_invoice', 'qbo_bill') */
  objectType: string;
  credentials: OAuthTokens;
  /** Delta sync: only records modified after this date */
  since?: Date;
  /** Maximum records per page (connector may override) */
  pageSize?: number;
  /** Opaque token for next-page continuation */
  pageToken?: string;
}

// ── Normalized record ─────────────────────────────────────────────────────────

/**
 * A single flattened record produced by a source connector.
 * fields is a flat string map — identical in structure to a CSV row —
 * so it passes through the existing field-mapping engine unchanged.
 */
export interface NormalizedRecord {
  /** Source system record ID */
  sourceId: string;
  /** Human-readable reference (invoice number, journal ref, etc.) */
  sourceRef?: string;
  /** Flat field map: all string values for compatibility with mapping engine */
  fields: Record<string, string>;
}

// ── Fetch result ──────────────────────────────────────────────────────────────

export interface FetchResult {
  records: NormalizedRecord[];
  /** Present if more pages available */
  nextPageToken?: string;
  hasMore: boolean;
  /** Total count if known (may be undefined for cursor-based APIs) */
  totalCount?: number;
}

// ── Field definition ──────────────────────────────────────────────────────────

export interface SourceFieldDefinition {
  key: string;
  label: string;
  description?: string;
  group: string;
  dataType?: 'string' | 'date' | 'decimal' | 'integer' | 'boolean';
  example?: string;
}

// ── Source connector interface ────────────────────────────────────────────────

export interface SourceConnector {
  readonly capabilities: SourceConnectorCapabilities;

  /**
   * Build the OAuth 2.0 authorization URL to redirect the user to.
   * @param state  CSRF-protection state value (caller stores this)
   * @param redirectUri  Callback URL registered with the provider
   */
  getAuthorizationUrl(state: string, redirectUri: string): string;

  /**
   * Exchange an authorization code for access/refresh tokens.
   */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /**
   * Refresh an expired access token using the stored refresh token.
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Verify that the stored credentials are still valid.
   */
  healthCheck(credentials: OAuthTokens): Promise<{ ok: boolean; message?: string }>;

  /**
   * Fetch records for the given object type and return normalized flat rows.
   * Implementations should handle pagination internally or honour pageToken.
   */
  fetchRecords(ctx: FetchContext): Promise<FetchResult>;

  /**
   * Return the field definitions this connector produces for a given object type.
   * Used to populate the field-mapping UI source column.
   */
  getFieldDefinitions(objectType: string): SourceFieldDefinition[];
}
