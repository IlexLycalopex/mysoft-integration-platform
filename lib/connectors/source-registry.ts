/**
 * Source connector registry
 *
 * Maps connector_key → SourceConnector instance.
 * Add new source connectors here as they are implemented.
 */

import type { SourceConnector } from './source.interface';
import { xeroConnector }         from './xero/index';
import { quickBooksConnector }   from './quickbooks/index';
import { sage50Connector }       from './sage50/index';

const REGISTRY: Record<string, SourceConnector> = {
  xero:               xeroConnector,
  quickbooks_online:  quickBooksConnector,
  sage50cloud:        sage50Connector,
};

export function getSourceConnector(connectorKey: string): SourceConnector | null {
  return REGISTRY[connectorKey] ?? null;
}

export function getAllSourceConnectors(): SourceConnector[] {
  return Object.values(REGISTRY);
}
