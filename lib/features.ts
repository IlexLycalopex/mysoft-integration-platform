/**
 * Canonical plan feature flags.
 * Features not in a plan's features[] array are locked/disabled.
 * Plans with features = [] or null get no gated features.
 * Plans can have ANY features — adding a flag to the array enables it.
 */

export const PLAN_FEATURES = [
  { key: 'white_label',        label: 'White Labelling',           description: 'Custom branding, logo, colours and CSS' },
  { key: 'approval_workflow',  label: 'Approval Workflow',         description: 'Require sign-off before processing jobs' },
  { key: 'multi_entity',       label: 'Multi-Entity',              description: 'Entity ID override per upload and watcher' },
  { key: 'saml_sso',           label: 'SAML / SSO',                description: 'Single sign-on via SAML identity provider' },
  { key: 'watchers',           label: 'Automated Watchers',        description: 'Scheduled file ingestion via Windows Agent' },
  { key: 'webhooks',           label: 'Webhooks',                  description: 'Outbound webhook notifications on job events' },
  { key: 'api_access',         label: 'API Access',                description: 'API keys for direct and agent integration' },
  { key: 'data_retention',     label: 'Data Retention Control',    description: 'Configurable file retention period' },
  { key: 'custom_css',         label: 'Custom CSS',                description: 'Inject custom CSS into the dashboard' },
] as const;

export type PlanFeatureKey = typeof PLAN_FEATURES[number]['key'];

/**
 * Check whether a feature is enabled for a given plan features array.
 * Platform admins always have access — pass isPlatformAdmin=true to bypass.
 */
export function hasFeature(
  features: string[] | null | undefined,
  feature: PlanFeatureKey,
  isPlatformAdmin = false
): boolean {
  if (isPlatformAdmin) return true;
  if (!features || features.length === 0) return false;
  return features.includes(feature);
}
