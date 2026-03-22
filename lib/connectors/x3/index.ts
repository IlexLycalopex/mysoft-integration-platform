/**
 * Sage X3 Connector — implements Connector interface
 *
 * Uses lib/connectors/x3/client.ts (REST + GraphQL) behind the connector
 * abstraction so the orchestration engine stays connector-agnostic.
 */

import { getX3Credentials } from '@/lib/actions/x3-credentials';
import { checkX3Health, submitToX3, dryRunX3 } from './client';
import { buildX3Payload } from './payload-builder';
import { X3_CAPABILITIES } from './capabilities';
import { classifyX3Failure } from './response-classifier';
import type {
  Connector,
  ConnectorCapabilities,
  BuildPayloadContext,
  SubmitContext,
  ConnectorResponse,
  ResponseClassification,
} from '../connector.interface';
import type { X3Payload } from './types';

export class X3Connector implements Connector {
  readonly capabilities: ConnectorCapabilities = X3_CAPABILITIES;

  async healthCheck(tenantId: string): Promise<boolean> {
    try {
      const creds = await getX3Credentials(tenantId);
      if (!creds) return false;
      const result = await checkX3Health(creds);
      return result.ok;
    } catch {
      return false;
    }
  }

  buildPayload(ctx: BuildPayloadContext): X3Payload {
    return buildX3Payload(ctx);
  }

  async submit(
    tenantId: string,
    payload: unknown,
    ctx: SubmitContext
  ): Promise<ConnectorResponse> {
    const typedPayload = payload as X3Payload;

    if (ctx.dryRun) {
      const result = await dryRunX3({} as never, typedPayload);
      return {
        success:     result.success,
        recordId:    result.recordId,
        rawResponse: result.rawResponse,
      };
    }

    const creds = await getX3Credentials(tenantId);
    if (!creds) {
      return {
        success: false,
        errors: [{
          code:    'NO_CREDENTIALS',
          message: 'No Sage X3 credentials configured for this tenant',
        }],
      };
    }

    try {
      const result = await submitToX3(creds, typedPayload);

      if (!result.success) {
        return {
          success:     false,
          rawResponse: result.rawResponse,
          errors:      (result.errors ?? []).map(e => ({
            code:    e.code,
            message: e.message,
            detail:  e.field ? `Field: ${e.field}` : undefined,
          })),
        };
      }

      return {
        success:     true,
        recordId:    result.recordId,
        rawResponse: result.rawResponse,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        errors:  [{ code: 'EXCEPTION', message }],
      };
    }
  }

  classifyFailure(response: ConnectorResponse): ResponseClassification {
    return classifyX3Failure(response);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: X3Connector | null = null;

export function getX3Connector(): X3Connector {
  _instance ??= new X3Connector();
  return _instance;
}
