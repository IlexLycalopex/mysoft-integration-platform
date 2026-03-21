export type SubscriptionStatus = 'trial' | 'active' | 'upcoming' | 'cancelled' | 'expired';

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  period_start: string;       // date string YYYY-MM-DD
  period_end: string;
  min_months: number;
  commitment_end_date: string;
  is_free_of_charge: boolean;
  discount_pct: number;
  plan_price_gbp: number | null;
  effective_price_gbp: number | null;  // generated column
  status: SubscriptionStatus;
  cancellation_date: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  superseded_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveSubscription extends TenantSubscription {
  plan_name: string;
  max_jobs_per_month: number | null;
  max_rows_per_month: number | null;
  max_storage_mb: number | null;
  max_watchers: number | null;
  max_api_keys: number | null;
  max_users: number | null;
  features: string[];
  in_minimum_period: boolean;
  days_until_commitment_end: number;
  days_until_period_end: number;
}

export type TransactionType =
  | 'journal_entry'
  | 'ar_invoice'
  | 'ap_bill'
  | 'expense_report'
  | 'ar_payment'
  | 'ap_payment'
  | 'timesheet'
  | 'vendor'
  | 'customer';

export type InheritanceMode = 'standalone' | 'linked' | 'inherit';
export type SyncStatus = 'up_to_date' | 'update_available' | 'conflict' | 'diverged';

export type MappingTransform = 'none' | 'date_format' | 'decimal' | 'boolean' | 'trim' | 'tr_type';

/** V1 mapping entry — still used in the DB and by the compat shim */
export interface ColumnMappingEntry {
  id: string;
  source_column: string;
  target_field: string;
  required: boolean;
  transform: MappingTransform;
}

/** V2 mapping entry — re-exported from the engine for use throughout the app */
export type { ColumnMappingEntryV2, TransformStep } from '@/lib/mapping-engine/types';

export type UserRole =
  | 'platform_super_admin'
  | 'mysoft_support_admin'
  | 'tenant_admin'
  | 'tenant_operator'
  | 'tenant_auditor';

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'offboarded';
export type TenantRegion = 'uk' | 'us' | 'eu';

export interface Database {
  public: {
    Tables: {
      plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          max_jobs_per_month: number | null;
          max_rows_per_month: number | null;
          max_storage_mb: number | null;
          max_watchers: number | null;
          max_api_keys: number | null;
          max_users: number | null;
          price_gbp_monthly: number | null;
          features: string[];
          is_active: boolean;
          sort_order: number;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          max_jobs_per_month?: number | null;
          max_rows_per_month?: number | null;
          max_storage_mb?: number | null;
          max_watchers?: number | null;
          max_api_keys?: number | null;
          max_users?: number | null;
          price_gbp_monthly?: number | null;
          features?: string[];
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          max_jobs_per_month?: number | null;
          max_rows_per_month?: number | null;
          max_storage_mb?: number | null;
          max_watchers?: number | null;
          max_api_keys?: number | null;
          max_users?: number | null;
          price_gbp_monthly?: number | null;
          features?: string[];
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      tenant_usage_monthly: {
        Row: {
          id: string;
          tenant_id: string;
          year_month: string;
          jobs_count: number;
          rows_processed: number;
          storage_bytes: number;
          computed_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          year_month: string;
          jobs_count?: number;
          rows_processed?: number;
          storage_bytes?: number;
          computed_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          year_month?: string;
          jobs_count?: number;
          rows_processed?: number;
          storage_bytes?: number;
          computed_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          home_region: TenantRegion;
          status: TenantStatus;
          settings: Record<string, unknown>;
          is_sandbox: boolean;
          sandbox_of: string | null;
          file_retention_days: number;
          plan_id: string | null;
          plan_assigned_at: string | null;
          trial_ends_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          home_region: TenantRegion;
          status?: TenantStatus;
          settings?: Record<string, unknown>;
          is_sandbox?: boolean;
          sandbox_of?: string | null;
          file_retention_days?: number;
          plan_id?: string | null;
          plan_assigned_at?: string | null;
          trial_ends_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          home_region?: TenantRegion;
          status?: TenantStatus;
          settings?: Record<string, unknown>;
          is_sandbox?: boolean;
          sandbox_of?: string | null;
          file_retention_days?: number;
          plan_id?: string | null;
          plan_assigned_at?: string | null;
          trial_ends_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          tenant_id: string | null;
          role: UserRole;
          first_name: string | null;
          last_name: string | null;
          is_active: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id?: string | null;
          role: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_invites: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: UserRole;
          token: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role: UserRole;
          token?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          role?: UserRole;
          token?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      upload_jobs: {
        Row: {
          id: string;
          tenant_id: string;
          created_by: string | null;
          filename: string;
          storage_path: string;
          file_size: number | null;
          mime_type: string | null;
          status: 'pending' | 'queued' | 'claimed' | 'processing' | 'awaiting_retry' | 'partially_completed' | 'completed' | 'completed_with_errors' | 'failed' | 'dead_letter' | 'cancelled' | 'awaiting_approval';
          row_count: number | null;
          processed_count: number;
          error_count: number;
          mapping_id: string | null;
          started_at: string | null;
          completed_at: string | null;
          error_message: string | null;
          sha256: string | null;
          watcher_config_id: string | null;
          source_type: 'manual' | 'agent' | 'sftp_poll' | 'http_push' | 'json_push' | null;
          auto_process: boolean;
          dry_run: boolean;
          requires_approval: boolean;
          approved_by: string | null;
          approved_at: string | null;
          rejected_by: string | null;
          rejected_at: string | null;
          rejection_note: string | null;
          intacct_record_nos: string[] | null;
          processing_log: Record<string, unknown>[] | null;
          file_deleted_at: string | null;
          entity_id_override: string | null;
          entity_id_used: string | null;
          region: string;
          // migration 038 — supporting document attachment
          attachment_storage_path: string | null;
          attachment_filename: string | null;
          attachment_mime_type: string | null;
          attachment_file_size: number | null;
          supdoc_id: string | null;
          supdoc_folder_name: string | null;
          // migration 031 — resilience / retry orchestration
          trace_id: string | null;
          priority: number;
          attempt_count: number;
          max_attempts: number;
          claimed_by: string | null;
          claimed_at: string | null;
          next_attempt_at: string | null;
          error_category: 'transient' | 'data' | 'configuration' | 'system' | null;
          last_error_code: string | null;
          last_error_message: string | null;
          source_artefact_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          created_by?: string | null;
          filename: string;
          storage_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          status?: 'pending' | 'queued' | 'claimed' | 'processing' | 'awaiting_retry' | 'partially_completed' | 'completed' | 'completed_with_errors' | 'failed' | 'dead_letter' | 'cancelled' | 'awaiting_approval';
          row_count?: number | null;
          processed_count?: number;
          error_count?: number;
          mapping_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          sha256?: string | null;
          watcher_config_id?: string | null;
          source_type?: 'manual' | 'agent' | 'sftp_poll' | 'http_push' | 'json_push' | null;
          auto_process?: boolean;
          dry_run?: boolean;
          requires_approval?: boolean;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          rejection_note?: string | null;
          intacct_record_nos?: string[] | null;
          processing_log?: Record<string, unknown>[] | null;
          file_deleted_at?: string | null;
          entity_id_override?: string | null;
          entity_id_used?: string | null;
          region?: string;
          // migration 038 — supporting document attachment
          attachment_storage_path?: string | null;
          attachment_filename?: string | null;
          attachment_mime_type?: string | null;
          attachment_file_size?: number | null;
          supdoc_id?: string | null;
          supdoc_folder_name?: string | null;
          // migration 031 — resilience / retry orchestration
          trace_id?: string | null;
          priority?: number;
          attempt_count?: number;
          max_attempts?: number;
          claimed_by?: string | null;
          claimed_at?: string | null;
          next_attempt_at?: string | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          source_artefact_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          created_by?: string | null;
          filename?: string;
          storage_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          status?: 'pending' | 'queued' | 'claimed' | 'processing' | 'awaiting_retry' | 'partially_completed' | 'completed' | 'completed_with_errors' | 'failed' | 'dead_letter' | 'cancelled' | 'awaiting_approval';
          row_count?: number | null;
          processed_count?: number;
          error_count?: number;
          mapping_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          sha256?: string | null;
          watcher_config_id?: string | null;
          source_type?: 'manual' | 'agent' | 'sftp_poll' | 'http_push' | 'json_push' | null;
          auto_process?: boolean;
          dry_run?: boolean;
          requires_approval?: boolean;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          rejection_note?: string | null;
          intacct_record_nos?: string[] | null;
          processing_log?: Record<string, unknown>[] | null;
          file_deleted_at?: string | null;
          entity_id_override?: string | null;
          entity_id_used?: string | null;
          region?: string;
          // migration 038 — supporting document attachment
          attachment_storage_path?: string | null;
          attachment_filename?: string | null;
          attachment_mime_type?: string | null;
          attachment_file_size?: number | null;
          supdoc_id?: string | null;
          supdoc_folder_name?: string | null;
          // migration 031 — resilience / retry orchestration
          trace_id?: string | null;
          priority?: number;
          attempt_count?: number;
          max_attempts?: number;
          claimed_by?: string | null;
          claimed_at?: string | null;
          next_attempt_at?: string | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          source_artefact_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_steps: {
        Row: {
          id: string;
          job_id: string;
          sequence: number;
          step_type: 'ingest' | 'parse' | 'validate_source' | 'validate_template' | 'transform' | 'enrich' | 'build_payload' | 'submit' | 'attach_documents' | 'reconcile' | 'complete';
          status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
          attempt_count: number;
          started_at: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          error_category: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code: string | null;
          error_message: string | null;
          metrics_json: Record<string, unknown> | null;
          metadata_json: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          sequence: number;
          step_type: 'ingest' | 'parse' | 'validate_source' | 'validate_template' | 'transform' | 'enrich' | 'build_payload' | 'submit' | 'attach_documents' | 'reconcile' | 'complete';
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
          attempt_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code?: string | null;
          error_message?: string | null;
          metrics_json?: Record<string, unknown> | null;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          sequence?: number;
          step_type?: 'ingest' | 'parse' | 'validate_source' | 'validate_template' | 'transform' | 'enrich' | 'build_payload' | 'submit' | 'attach_documents' | 'reconcile' | 'complete';
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
          attempt_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code?: string | null;
          error_message?: string | null;
          metrics_json?: Record<string, unknown> | null;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_items: {
        Row: {
          id: string;
          job_id: string;
          tenant_id: string;
          item_key: string | null;
          item_sequence: number | null;
          source_row_number: number | null;
          status: 'pending' | 'parsed' | 'validated' | 'transformed' | 'submitted' | 'posted' | 'failed' | 'reprocessable' | 'skipped';
          idempotency_key: string | null;
          validation_errors_json: Array<{ field: string; message: string }> | null;
          transformed_payload_json: Record<string, string> | null;
          endpoint_payload_json: Record<string, unknown> | null;
          endpoint_record_id: string | null;
          endpoint_response_json: Record<string, unknown> | null;
          error_category: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code: string | null;
          error_message: string | null;
          reprocessable: boolean;
          posted_at: string | null;
          metadata_json: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          tenant_id: string;
          item_key?: string | null;
          item_sequence?: number | null;
          source_row_number?: number | null;
          status?: 'pending' | 'parsed' | 'validated' | 'transformed' | 'submitted' | 'posted' | 'failed' | 'reprocessable' | 'skipped';
          idempotency_key?: string | null;
          validation_errors_json?: Array<{ field: string; message: string }> | null;
          transformed_payload_json?: Record<string, string> | null;
          endpoint_payload_json?: Record<string, unknown> | null;
          endpoint_record_id?: string | null;
          endpoint_response_json?: Record<string, unknown> | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code?: string | null;
          error_message?: string | null;
          reprocessable?: boolean;
          posted_at?: string | null;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          tenant_id?: string;
          item_key?: string | null;
          item_sequence?: number | null;
          source_row_number?: number | null;
          status?: 'pending' | 'parsed' | 'validated' | 'transformed' | 'submitted' | 'posted' | 'failed' | 'reprocessable' | 'skipped';
          idempotency_key?: string | null;
          validation_errors_json?: Array<{ field: string; message: string }> | null;
          transformed_payload_json?: Record<string, string> | null;
          endpoint_payload_json?: Record<string, unknown> | null;
          endpoint_record_id?: string | null;
          endpoint_response_json?: Record<string, unknown> | null;
          error_category?: 'transient' | 'data' | 'configuration' | 'system' | null;
          error_code?: string | null;
          error_message?: string | null;
          reprocessable?: boolean;
          posted_at?: string | null;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_events: {
        Row: {
          id: string;
          job_id: string;
          job_step_id: string | null;
          job_item_id: string | null;
          event_type: string;
          severity: 'info' | 'warn' | 'error' | 'success';
          message: string;
          metadata_json: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          job_step_id?: string | null;
          job_item_id?: string | null;
          event_type: string;
          severity?: 'info' | 'warn' | 'error' | 'success';
          message: string;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          job_step_id?: string | null;
          job_item_id?: string | null;
          event_type?: string;
          severity?: 'info' | 'warn' | 'error' | 'success';
          message?: string;
          metadata_json?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      job_errors: {
        Row: {
          id: string;
          job_id: string;
          tenant_id: string;
          row_number: number | null;
          field_name: string | null;
          error_code: string | null;
          error_message: string;
          raw_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          tenant_id: string;
          row_number?: number | null;
          field_name?: string | null;
          error_code?: string | null;
          error_message: string;
          raw_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      field_mappings: {
        Row: {
          id: string;
          tenant_id: string | null;
          name: string;
          description: string | null;
          transaction_type: TransactionType | null;
          object_type_id: string | null;
          is_default: boolean;
          is_template: boolean;
          template_status: 'draft' | 'published';
          column_mappings: ColumnMappingEntry[];
          template_version: number;
          parent_template_id: string | null;
          parent_template_version: number | null;
          inheritance_mode: InheritanceMode;
          sync_status: SyncStatus | null;
          last_synced_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          name: string;
          description?: string | null;
          transaction_type?: TransactionType | null;
          object_type_id?: string | null;
          is_default?: boolean;
          is_template?: boolean;
          template_status?: 'draft' | 'published';
          column_mappings?: ColumnMappingEntry[];
          template_version?: number;
          parent_template_id?: string | null;
          parent_template_version?: number | null;
          inheritance_mode?: InheritanceMode;
          sync_status?: SyncStatus | null;
          last_synced_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          name?: string;
          description?: string | null;
          transaction_type?: TransactionType | null;
          object_type_id?: string | null;
          is_default?: boolean;
          is_template?: boolean;
          template_status?: 'draft' | 'published';
          column_mappings?: ColumnMappingEntry[];
          template_version?: number;
          parent_template_id?: string | null;
          parent_template_version?: number | null;
          inheritance_mode?: InheritanceMode;
          sync_status?: SyncStatus | null;
          last_synced_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      endpoint_connectors: {
        Row: {
          id: string;
          connector_key: string;
          display_name: string;
          description: string | null;
          logo_url: string | null;
          is_system: boolean;
          is_active: boolean;
          config_schema: Record<string, unknown> | null;
          capabilities: Record<string, unknown>;
          sort_order: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          connector_key: string;
          display_name: string;
          description?: string | null;
          logo_url?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          config_schema?: Record<string, unknown> | null;
          capabilities?: Record<string, unknown>;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          connector_key?: string;
          display_name?: string;
          description?: string | null;
          logo_url?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          config_schema?: Record<string, unknown> | null;
          capabilities?: Record<string, unknown>;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      endpoint_object_types: {
        Row: {
          id: string;
          connector_id: string;
          object_key: string;
          display_name: string;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
          field_schema: Record<string, unknown> | null;
          api_object_name: string | null;
          pipeline_config: Record<string, unknown> | null;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          connector_id: string;
          object_key: string;
          display_name: string;
          description?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          field_schema?: Record<string, unknown> | null;
          api_object_name?: string | null;
          pipeline_config?: Record<string, unknown> | null;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          connector_id?: string;
          object_key?: string;
          display_name?: string;
          description?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          field_schema?: Record<string, unknown> | null;
          api_object_name?: string | null;
          pipeline_config?: Record<string, unknown> | null;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      template_version_history: {
        Row: {
          id: string;
          template_id: string;
          version: number;
          column_mappings: unknown[];
          change_summary: string | null;
          published_at: string;
          published_by: string | null;
        };
        Insert: {
          id?: string;
          template_id: string;
          version: number;
          column_mappings: unknown[];
          change_summary?: string | null;
          published_at?: string;
          published_by?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      connector_field_cache: {
        Row: {
          id: string;
          connector_key: string;
          object_type_key: string;
          tenant_id: string | null;
          schema_data: unknown[];
          source: 'api' | 'static' | 'manual';
          ttl_hours: number;
          discovered_at: string;
          discovered_by: string | null;
        };
        Insert: {
          id?: string;
          connector_key: string;
          object_type_key: string;
          tenant_id?: string | null;
          schema_data: unknown[];
          source?: 'api' | 'static' | 'manual';
          ttl_hours?: number;
          discovered_at?: string;
          discovered_by?: string | null;
        };
        Update: {
          id?: string;
          connector_key?: string;
          object_type_key?: string;
          tenant_id?: string | null;
          schema_data?: unknown[];
          source?: 'api' | 'static' | 'manual';
          ttl_hours?: number;
          discovered_at?: string;
          discovered_by?: string | null;
        };
        Relationships: [];
      };
      platform_credentials: {
        Row: {
          id: string;
          provider: string;
          encrypted_data: string;
          iv: string;
          auth_tag: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          encrypted_data: string;
          iv: string;
          auth_tag: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          encrypted_data?: string;
          iv?: string;
          auth_tag?: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          key: string;
          value: unknown;
          description: string | null;
          updated_at: string;
          updated_by: string | null;
          scope: 'global' | 'regional';
        };
        Insert: {
          key: string;
          value: unknown;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          scope?: 'global' | 'regional';
        };
        Update: {
          key?: string;
          value?: unknown;
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          scope?: 'global' | 'regional';
        };
        Relationships: [];
      };
      tenant_credentials: {
        Row: {
          id: string;
          tenant_id: string;
          provider: string;
          encrypted_data: string;
          iv: string;
          auth_tag: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          provider?: string;
          encrypted_data: string;
          iv: string;
          auth_tag: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          provider?: string;
          encrypted_data?: string;
          iv?: string;
          auth_tag?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          created_by: string | null;
          last_used_at: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          created_by?: string | null;
          last_used_at?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          key_hash?: string;
          key_prefix?: string;
          created_by?: string | null;
          last_used_at?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      watcher_configs: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          source_type: 'local_folder' | 'sftp' | 'http_push';
          folder_path: string | null;
          sftp_host: string | null;
          sftp_port: number | null;
          sftp_username: string | null;
          sftp_password_enc: string | null;
          sftp_remote_path: string | null;
          push_token: string | null;
          last_polled_at: string | null;
          file_pattern: string;
          mapping_id: string | null;
          archive_action: 'move' | 'delete' | 'leave';
          archive_folder: string | null;
          poll_interval: number;
          auto_process: boolean;
          enabled: boolean;
          entity_id_override: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          source_type: 'local_folder' | 'sftp' | 'http_push';
          folder_path?: string | null;
          sftp_host?: string | null;
          sftp_port?: number | null;
          sftp_username?: string | null;
          sftp_password_enc?: string | null;
          sftp_remote_path?: string | null;
          push_token?: string | null;
          last_polled_at?: string | null;
          file_pattern?: string;
          mapping_id?: string | null;
          archive_action?: 'move' | 'delete' | 'leave';
          archive_folder?: string | null;
          poll_interval?: number;
          auto_process?: boolean;
          enabled?: boolean;
          entity_id_override?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          source_type?: 'local_folder' | 'sftp' | 'http_push';
          folder_path?: string | null;
          sftp_host?: string | null;
          sftp_port?: number | null;
          sftp_username?: string | null;
          sftp_password_enc?: string | null;
          sftp_remote_path?: string | null;
          push_token?: string | null;
          last_polled_at?: string | null;
          file_pattern?: string;
          mapping_id?: string | null;
          archive_action?: 'move' | 'delete' | 'leave';
          archive_folder?: string | null;
          poll_interval?: number;
          auto_process?: boolean;
          enabled?: boolean;
          entity_id_override?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_endpoints: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          url: string;
          secret: string | null;
          events: string[];
          enabled: boolean;
          last_triggered_at: string | null;
          last_status_code: number | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          url: string;
          secret?: string | null;
          events?: string[];
          enabled?: boolean;
          last_triggered_at?: string | null;
          last_status_code?: number | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          url?: string;
          secret?: string | null;
          events?: string[];
          enabled?: boolean;
          last_triggered_at?: string | null;
          last_status_code?: number | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_branding: {
        Row: {
          tenant_id: string;
          brand_name: string | null;
          logo_url: string | null;
          favicon_url: string | null;
          primary_color: string;
          accent_color: string;
          support_email: string | null;
          support_url: string | null;
          custom_css: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          brand_name?: string | null;
          logo_url?: string | null;
          favicon_url?: string | null;
          primary_color?: string;
          accent_color?: string;
          support_email?: string | null;
          support_url?: string | null;
          custom_css?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          brand_name?: string | null;
          logo_url?: string | null;
          favicon_url?: string | null;
          primary_color?: string;
          accent_color?: string;
          support_email?: string | null;
          support_url?: string | null;
          custom_css?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      alert_events: {
        Row: {
          id: string;
          tenant_id: string | null;
          alert_type: string;
          resource_id: string | null;
          sent_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          alert_type: string;
          resource_id?: string | null;
          sent_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          alert_type?: string;
          resource_id?: string | null;
          sent_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          tenant_id: string | null;
          user_id: string | null;
          operation: string;
          resource_type: string | null;
          resource_id: string | null;
          old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          operation: string;
          resource_type?: string | null;
          resource_id?: string | null;
          old_values?: Record<string, unknown> | null;
          new_values?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      tenant_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          period_start: string;
          period_end: string;
          min_months: number;
          commitment_end_date: string;
          is_free_of_charge: boolean;
          discount_pct: number;
          plan_price_gbp: number | null;
          effective_price_gbp: number | null;
          status: SubscriptionStatus;
          cancellation_date: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          notes: string | null;
          superseded_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_id: string;
          period_start: string;
          period_end: string;
          min_months?: number;
          commitment_end_date: string;
          is_free_of_charge?: boolean;
          discount_pct?: number;
          plan_price_gbp?: number | null;
          status?: SubscriptionStatus;
          cancellation_date?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          superseded_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          plan_id?: string;
          period_start?: string;
          period_end?: string;
          min_months?: number;
          commitment_end_date?: string;
          is_free_of_charge?: boolean;
          discount_pct?: number;
          plan_price_gbp?: number | null;
          status?: SubscriptionStatus;
          cancellation_date?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          superseded_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      active_subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          period_start: string;
          period_end: string;
          min_months: number;
          commitment_end_date: string;
          is_free_of_charge: boolean;
          discount_pct: number;
          plan_price_gbp: number | null;
          effective_price_gbp: number | null;
          status: SubscriptionStatus;
          cancellation_date: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          notes: string | null;
          superseded_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          plan_name: string;
          max_jobs_per_month: number | null;
          max_rows_per_month: number | null;
          max_storage_mb: number | null;
          max_watchers: number | null;
          max_api_keys: number | null;
          max_users: number | null;
          features: string[];
          in_minimum_period: boolean;
          days_until_commitment_end: number;
          days_until_period_end: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_my_role: { Args: Record<PropertyKey, never>; Returns: UserRole };
      get_my_tenant_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      change_tenant_subscription: {
        Args: {
          p_tenant_id: string;
          p_plan_id: string;
          p_min_months?: number;
          p_is_free_of_charge?: boolean;
          p_discount_pct?: number;
          p_notes?: string | null;
          p_created_by?: string | null;
          p_commencement_date?: string | null;
        };
        Returns: string;
      };
      process_subscription_renewals: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      activate_upcoming_subscriptions: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      process_trial_expirations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      process_tenant_offboarding: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      delete_tenant: {
        Args: {
          p_tenant_id: string;
          p_confirmed_name: string;
          p_deleted_by: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      user_role: UserRole;
      tenant_status: TenantStatus;
      tenant_region: TenantRegion;
    };
    CompositeTypes: Record<string, never>;
  };
}
