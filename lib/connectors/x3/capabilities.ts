/**
 * Sage X3 Connector — Capability declaration
 */

import type { ConnectorCapabilities } from '../connector.interface';

export const X3_CAPABILITIES: ConnectorCapabilities = {
  connectorType:        'sage_x3',
  displayName:          'Sage X3',
  supportedObjectTypes: [
    'x3_gaccentry',
    'x3_sinvoice',
    'x3_pinvoice',
    'x3_bpcustomer',
    'x3_bpsupplier',
    'x3_itmmaster',
    'x3_payment',
  ],
  supportsDryRun:             true,
  supportsUpsert:             false,
  supportsAttachments:        false,
  supportsFieldDiscovery:     false,
  fieldDiscoveryRequiresAuth: false,
  supportsHealthCheck:        true,
};
