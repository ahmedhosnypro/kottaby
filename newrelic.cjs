/**
 * New Relic Agent Configuration
 *
 * On Vercel, environment variables override this file.
 * This file serves as local reference and for non-Vercel deployments.
 *
 * The New Relic Node.js agent loads this config via require(), so it MUST be
 * CommonJS (.cjs). TypeScript is not supported for the agent config.
 */
exports.config = {
  // ─── Application Identity ──────────────────────────────────────────────
  app_name: "Kottaby", // Override with NEW_RELIC_APP_NAME for composite naming: "Kottaby-Deploy-1;Kottaby-Production"
  // labels: {}, // Set via NEW_RELIC_LABELS env var: "env:production;tier:enterprise"
  license_key: process.env.NEW_RELIC_LICENSE_KEY || "",

  // ─── Logging ──────────────────────────────────────────────────────────
  logging: {
    level: "warn", // Temporarily set NEW_RELIC_LOG_LEVEL=debug for troubleshooting
  },

  // ─── Distributed Tracing ───────────────────────────────────────────────
  distributed_tracing: {
    enabled: true,
  },

  // ─── OpenTelemetry Integration ─────────────────────────────────────────
  // Enable Hybrid Agent mode so the New Relic agent intercepts Next.js
  // OpenTelemetry spans instead of generating its own duplicate spans.
  // NOTE: newrelic@12.x reads `opentelemetry_bridge.enabled`, NOT `opentelemetry.enabled`.
  opentelemetry_bridge: {
    enabled: true,
    traces: {
      enabled: true,
    },
  },

  // ─── Instrumentation Overrides ─────────────────────────────────────────
  // Disable built-in HTTP/Next/Undici instrumentation to avoid duplicate
  // spans — Next.js OTel already produces these spans and the Hybrid Agent
  // captures them via the OpenTelemetry bridge above.
  instrumentation: {
    http: {
      enabled: false,
    },
    next: {
      enabled: false,
    },
    undici: {
      enabled: false,
    },
  },
};
