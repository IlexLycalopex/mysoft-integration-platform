import type { ConnectorLicenceRow } from '@/lib/actions/connector-licences';

/** Computes the effective monthly price after applying discount_pct. */
export function effectiveConnectorPrice(licence: ConnectorLicenceRow): number {
  const list = licence.price_gbp_monthly ?? 0;
  const discount = licence.discount_pct ?? 0;
  return list * (1 - discount / 100);
}
