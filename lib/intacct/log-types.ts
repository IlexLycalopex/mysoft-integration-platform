/** Shared type for processing log entries stored on upload_jobs.processing_log */
export interface ProcessingLogEntry {
  t: string;
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
  data?: Record<string, unknown>;
}
