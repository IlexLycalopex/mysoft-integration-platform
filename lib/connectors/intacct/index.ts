/**
 * Intacct Connector — implements Connector interface
 *
 * Wraps lib/intacct/client.ts calls behind the connector abstraction.
 * The orchestration engine calls this; knows nothing about Intacct internals.
 */

import { getCredentials } from '@/lib/actions/credentials';
import {
  testConnection,
  createJournalEntry, createArInvoice, createApBill,
  createArPayment, createApPayment, createExpenseReport,
  createTimesheet, createVendor, createCustomer,
} from '@/lib/intacct/client';
import type { Connector, ConnectorCapabilities, BuildPayloadContext, SubmitContext, ConnectorResponse, ResponseClassification } from '../connector.interface';
import { INTACCT_CAPABILITIES } from './capabilities';
import { buildIntacctPayload, type IntacctPayload } from './payload-builder';
import { classifyIntacctFailure } from './response-classifier';

export class IntacctConnector implements Connector {
  readonly capabilities: ConnectorCapabilities = INTACCT_CAPABILITIES;

  async healthCheck(tenantId: string): Promise<boolean> {
    try {
      const creds = await getCredentials(tenantId);
      if (!creds) return false;
      const result = await testConnection(creds);
      return result.success;
    } catch {
      return false;
    }
  }

  buildPayload(ctx: BuildPayloadContext): IntacctPayload {
    return buildIntacctPayload(ctx);
  }

  async submit(
    tenantId: string,
    payload: unknown,
    ctx: SubmitContext
  ): Promise<ConnectorResponse> {
    const typedPayload = payload as IntacctPayload;

    if (ctx.dryRun) {
      return { success: true, recordId: undefined, rawResponse: { dryRun: true, payload: typedPayload } };
    }

    const creds = await getCredentials(tenantId);
    if (!creds) {
      return {
        success: false,
        errors: [{ code: 'NO_CREDENTIALS', message: 'No Intacct credentials configured for this tenant' }],
      };
    }

    try {
      const result = await this._dispatch(creds, typedPayload);

      if (!result.success) {
        const errors = (result.errors ?? []).map(e => ({
          code:        e.errorno,
          message:     e.description,
          detail:      e.description2,
          correction:  e.correction,
        }));
        return { success: false, errors, rawResponse: { rawXml: result.rawXml } };
      }

      return {
        success: true,
        recordId: result.recordNo,
        rawResponse: { rawXml: result.rawXml?.slice(0, 500) },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, errors: [{ code: 'EXCEPTION', message }] };
    }
  }

  classifyFailure(response: ConnectorResponse): ResponseClassification {
    return classifyIntacctFailure(response);
  }

  // ── Private dispatch ──────────────────────────────────────────────────────

  private async _dispatch(
    creds: import('@/lib/intacct/types').IntacctCredentials,
    payload: IntacctPayload
  ): Promise<import('@/lib/intacct/types').IntacctResponse> {
    switch (payload.type) {
      case 'journal_entry':  return createJournalEntry(creds, payload.data);
      case 'ar_invoice':     return createArInvoice(creds, payload.data);
      case 'ap_bill':        return createApBill(creds, payload.data);
      case 'ar_payment':     return createArPayment(creds, payload.data);
      case 'ap_payment':     return createApPayment(creds, payload.data);
      case 'expense_report': return createExpenseReport(creds, payload.data);
      case 'timesheet':      return createTimesheet(creds, payload.data);
      case 'vendor':         return createVendor(creds, payload.data);
      case 'customer':       return createCustomer(creds, payload.data);
      default: {
        const exhaustive: never = payload;
        throw new Error(`Unsupported payload type: ${(exhaustive as IntacctPayload).type}`);
      }
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: IntacctConnector | null = null;

export function getIntacctConnector(): IntacctConnector {
  _instance ??= new IntacctConnector();
  return _instance;
}
