/**
 * Intacct Connector — Capability declaration
 */

import type { ConnectorCapabilities } from '../connector.interface';

export const INTACCT_CAPABILITIES: ConnectorCapabilities = {
  connectorType:         'intacct',
  displayName:           'Sage Intacct',
  supportedObjectTypes: [
    'journal_entry',
    'ar_invoice',
    'ap_bill',
    'ar_payment',
    'ap_payment',
    'expense_report',
    'timesheet',
    'vendor',
    'customer',
  ],
  supportsDryRun:         true,
  supportsUpsert:         false,  // Intacct create-only for most objects
  supportsAttachments:    false,  // Phase 5 future work
  supportsFieldDiscovery: false,  // Phase 5 future work
  supportsHealthCheck:    true,
};
