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
  supportsDryRun:              true,
  supportsUpsert:              false,
  supportsAttachments:         false,
  supportsFieldDiscovery:      true,
  fieldDiscoveryRequiresAuth:  true,  // uses tenant Intacct credentials
  supportsHealthCheck:         true,
};
