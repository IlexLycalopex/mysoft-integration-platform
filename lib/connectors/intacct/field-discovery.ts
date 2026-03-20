/**
 * Intacct Field Discovery
 *
 * Uses Intacct's XML API <lookup> function to introspect the field list
 * for a given object type. Results are compared against static definitions
 * in intacct-fields.ts — the static file provides human-readable labels
 * and descriptions; discovery validates/extends the key set.
 */

import type { DiscoveredField } from '@/lib/connectors/connector.interface';
import { INTACCT_FIELDS } from '@/lib/intacct-fields';

// Map from our object type keys to Intacct API object names
const OBJECT_TYPE_TO_API_NAME: Record<string, string> = {
  journal_entry:  'GLJOURNAL',
  ar_invoice:     'ARINVOICE',
  ap_bill:        'APBILL',
  ar_payment:     'ARPAYMENT',
  ap_payment:     'APPAYMENT',
  expense_report: 'EEXPENSES',
  timesheet:      'TIMESHEET',
  vendor:         'VENDOR',
  customer:       'CUSTOMER',
};

interface IntacctCredentials {
  companyId: string;
  userId: string;
  password: string;
  clientId?: string;
  clientSecret?: string;
  sessionId?: string;
}

/**
 * Discover fields for an object type from the Intacct API.
 *
 * Falls back to static definitions if:
 *  - The object type is not known to the Intacct API
 *  - The API call fails
 *  - No credentials are available
 *
 * @returns Discovered fields (merged with static label data where available)
 */
export async function discoverIntacctFields(
  objectType: string,
  credentials: IntacctCredentials,
): Promise<DiscoveredField[]> {
  const apiObjectName = OBJECT_TYPE_TO_API_NAME[objectType];

  if (!apiObjectName) {
    // Unknown object type — return static fields if available
    return staticFieldsForType(objectType);
  }

  try {
    const xml = buildLookupXml(apiObjectName, credentials);
    const response = await callIntacctApi(xml, credentials);
    const discovered = parseFieldsFromLookupResponse(response, objectType);
    return discovered;
  } catch {
    // API discovery failed — fall back to static definitions
    return staticFieldsForType(objectType);
  }
}

// ── XML builder ────────────────────────────────────────────────────────────────

function buildLookupXml(apiObjectName: string, creds: IntacctCredentials): string {
  const controlId = `lookup_${apiObjectName}_${Date.now()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>mysoft_integration</senderid>
    <password>...</password>
    <controlid>${controlId}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${escapeXml(creds.userId)}</userid>
        <companyid>${escapeXml(creds.companyId)}</companyid>
        <password>${escapeXml(creds.password)}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${controlId}">
        <lookup>
          <object>${escapeXml(apiObjectName)}</object>
        </lookup>
      </function>
    </content>
  </operation>
</request>`;
}

// ── API call (uses existing Intacct HTTP infrastructure) ────────────────────────

async function callIntacctApi(xml: string, _creds: IntacctCredentials): Promise<string> {
  const INTACCT_API_URL = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

  const response = await fetch(INTACCT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `xmlrequest=${encodeURIComponent(xml)}`,
    signal: AbortSignal.timeout(15_000), // 15s timeout
  });

  if (!response.ok) {
    throw new Error(`Intacct API returned ${response.status}`);
  }

  return response.text();
}

// ── Response parser ────────────────────────────────────────────────────────────

function parseFieldsFromLookupResponse(xmlText: string, objectType: string): DiscoveredField[] {
  // Parse field names from Intacct <Field> elements in the lookup response
  // Pattern: <Field><ID>FIELDNAME</ID><LABEL>...</LABEL><DATATYPE>...</DATATYPE></Field>
  const fieldPattern = /<Field>[\s\S]*?<ID>(.*?)<\/ID>[\s\S]*?(?:<LABEL>(.*?)<\/LABEL>)?[\s\S]*?(?:<DATATYPE>(.*?)<\/DATATYPE>)?[\s\S]*?(?:<REQUIRED>(.*?)<\/REQUIRED>)?[\s\S]*?<\/Field>/gi;

  const staticFields = INTACCT_FIELDS[objectType] ?? [];
  const staticByKey = new Map(staticFields.map((f) => [f.key, f]));

  const discovered: DiscoveredField[] = [];
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(xmlText)) !== null) {
    const key = match[1]?.trim();
    if (!key) continue;

    const apiLabel    = match[2]?.trim();
    const apiDataType = match[3]?.trim()?.toLowerCase();
    const apiRequired = match[4]?.trim()?.toLowerCase();

    // Enrich with static data where available
    const staticDef = staticByKey.get(key);

    discovered.push({
      key,
      label:       staticDef?.label       ?? apiLabel ?? key,
      description: staticDef?.description ?? '',
      required:    staticDef?.required    ?? apiRequired === 'true',
      group:       staticDef?.group       ?? 'line',
      dataType:    mapIntacctDataType(apiDataType),
    });
  }

  // If parsing produced no results (e.g., API format changed), fall back to static
  if (discovered.length === 0) return staticFieldsForType(objectType);

  return discovered;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function staticFieldsForType(objectType: string): DiscoveredField[] {
  const fields = INTACCT_FIELDS[objectType] ?? [];
  return fields.map((f) => ({
    key:         f.key,
    label:       f.label,
    description: f.description,
    required:    f.required,
    group:       f.group,
  }));
}

function mapIntacctDataType(
  apiType: string | undefined,
): DiscoveredField['dataType'] {
  if (!apiType) return 'string';
  if (apiType.includes('date'))    return 'date';
  if (apiType.includes('decimal') || apiType.includes('number') || apiType.includes('currency')) return 'decimal';
  if (apiType.includes('bool') || apiType.includes('checkbox')) return 'boolean';
  if (apiType.includes('int'))     return 'integer';
  return 'string';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}
