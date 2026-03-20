/**
 * Validate Template Step — Check mapping, template, and endpoint readiness
 *
 * Verifies the mapping is active, all required fields can be resolved,
 * and (for non-dry-run) optionally checks connector health.
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult } from '@/lib/jobs/types';

export const validateTemplateStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, events, columnMappings, transactionType, connector } = ctx;

    // Must have a mapping
    if (!job.mapping_id) {
      return {
        success: false,
        error: {
          category: 'configuration',
          code:     'NO_MAPPING',
          message:  'No field mapping assigned to this job. Edit the job to assign a mapping.',
        },
      };
    }

    // Mapping must not be empty
    if (!columnMappings || columnMappings.length === 0) {
      return {
        success: false,
        error: {
          category: 'configuration',
          code:     'EMPTY_MAPPING',
          message:  'The assigned field mapping has no column definitions.',
        },
      };
    }

    // Transaction type must be supported by the connector
    if (!connector.capabilities.supportedObjectTypes.includes(transactionType)) {
      return {
        success: false,
        error: {
          category: 'configuration',
          code:     'UNSUPPORTED_OBJECT_TYPE',
          message:  `Transaction type '${transactionType}' is not supported by connector '${connector.capabilities.displayName}'.`,
        },
      };
    }

    // Verify all required fields have a source_column or use a multi-source step
    const unmappedRequired = columnMappings.filter(m => {
      if (!m.required) return false;
      // Has source column, or has a static/concat/coalesce step (no source needed)
      const hasSource = !!m.source_column;
      const hasStaticStep = m.steps?.some(s =>
        s.type === 'static' || s.type === 'concat' || s.type === 'coalesce' || s.type === 'formula'
      );
      return !hasSource && !hasStaticStep;
    });

    if (unmappedRequired.length > 0) {
      const fields = unmappedRequired.map(m => m.target_field).join(', ');
      return {
        success: false,
        error: {
          category: 'configuration',
          code:     'UNMAPPED_REQUIRED_FIELDS',
          message:  `Required fields have no source column or step: ${fields}`,
        },
      };
    }

    // Optional: check connector health for live (non-dry-run) jobs
    if (!job.dry_run && connector.capabilities.supportsHealthCheck) {
      const healthy = await connector.healthCheck(job.tenant_id);
      if (!healthy) {
        return {
          success: false,
          error: {
            category: 'transient',
            code:     'CONNECTOR_HEALTH_FAILED',
            message:  `Cannot reach ${connector.capabilities.displayName} endpoint — credentials may be invalid or service unavailable.`,
          },
        };
      }
    }

    await events.info('step_completed',
      `Template validation passed: ${columnMappings.length} mappings, type=${transactionType}`,
      { mappingCount: columnMappings.length, transactionType, dryRun: job.dry_run }
    );

    return {
      success:  true,
      items,
      metrics:  { mapping_count: columnMappings.length },
    };
  },
};
