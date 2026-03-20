/**
 * Sage Intacct API types.
 * Intacct uses XML-over-HTTPS (not REST).
 */

/** Full credentials passed to the XML client on each request — matches lib/actions/credentials.ts IntacctCredentials */
export interface IntacctCredentials {
  companyId: string;
  userId: string;
  userPassword: string;
  senderId: string;
  senderPassword: string;
  /** Optional entity/location ID for multi-entity companies.
   *  Passed as <locationid> in the Intacct login block so all requests
   *  are scoped to that entity.  Also becomes the default LOCATIONID on
   *  GLENTRY lines that don't supply one explicitly. */
  entityId?: string;
}

export interface IntacctResponse {
  success: boolean;
  controlId: string;
  data?: Record<string, unknown>[];
  errors?: IntacctError[];
  /** Intacct RECORDNO returned for create operations (GLBATCH, ARINVOICE, APBILL etc.) */
  recordNo?: string;
  /** Raw parsed result node — stored in processing log for debugging */
  rawResult?: Record<string, unknown>;
  /** First 1500 chars of the raw XML response — stored in processing log for debugging */
  rawXml?: string;
  /** First 2000 chars of the XML request sent to Intacct — stored in processing log for debugging */
  requestXml?: string;
}

export interface IntacctError {
  errorno: string;
  description: string;
  description2?: string;
  correction?: string;
}
