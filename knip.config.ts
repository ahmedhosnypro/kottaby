import type { KnipConfig } from "knip";

/**
 * Knip unused-code / unused-dependency analysis.
 * Prefer `knip.config.ts` over `knip.ts` so `import … from "knip"` resolves to the package.
 *
 * Next.js, Storybook, Bun test, ESLint, Biome, and Drizzle plugins auto-detect their own
 * entry files; `entry` / `project` below set the analysis scope for this monorepo layout.
 */
const config: KnipConfig = {
  entry: [
    "app/**/page.tsx",
    "app/**/layout.tsx",
    "app/**/route.ts",
    "app/**/loading.tsx",
    "app/**/error.tsx",
    "app/**/template.tsx",
    "app/**/actions.ts",
    "scripts/**/*.ts",

    // Backend DB seed & migration runners — invoked via `bun run` / `drizzle-kit`,
    // they are the import-graph root for 100+ backend/db/seeds/** files
    "backend/db/scripts/**/*.ts",
    "backend/db/seeds/index.ts",

    // GraphQL schema side-effect registration — `import "@/backend/graphql/pothos"`
    // registers all Pothos types by side-effect (no named imports from the call site)
    "backend/graphql/gqlSchema.definitions.ts",
    "backend/graphql/pothos/index.ts",
    "backend/graphql/query/index.ts",
    "backend/graphql/mutation/index.ts",

    // Bun --preload test roots — loaded via `bun test --preload <file>` CLI flag,
    // never statically imported (package.json scripts: test:ui:components, test:ui:e2e, etc.)
    "test/ui/test-env.ts",
    "test/ui/e2e-preload.ts",
    "test/ui/components/happydom-preload.ts",
    "test/ui/components/next-dynamic-mock.ts",
    "test/integration/preload/live-comm-preload.ts",
    "test/integration/preload/live-fx-preload.ts",
  ],
  project: [
    "app/**/*.{ts,tsx}",
    "backend/**/*.{ts,tsx}",
    "frontend/**/*.{ts,tsx}",
    "shared/**/*.{ts,tsx}",
    "scripts/**/*.{ts,tsx}",
    "test/**/*.{ts,tsx}",
  ],
  ignore: [
    "**/.*/**",
    "!.storybook/**",
    "storage/**",
    "**/generated/**",
    "**/*.d.ts",

    // Storybook story aggregation — re-exports *.stories.tsx, accessed only by
    // @storybook/react plugin globbing, never by app code
    "frontend/stories/**",

    // Auto-generated exhaustive IANA timezone catalog — consumed via Object.values(),
    // individual members are never referenced by name (441 enumMember false positives)
    "shared/constants/iana-timezone.enum.ts",
    // Hand-curated ISO-3166 country catalog — members represent valid input options
    // for regional app, removing "unused" members risks dropping valid selections (246 false positives)
    "backend/enum/shared/country.enum.ts",
    // Hand-maintained RBAC permission enum — consumed dynamically via Object.values()
    // and filterKnownAppPermissions() which explicitly handles legacy permission removal (81 false positives)
    "backend/enum/permissions/permission.enum.ts",

    // Barrel re-export false positives — consumers import from source files directly,
    // so barrel re-exports appear unused to knip but the symbols themselves are live

    // i18n compile-time namespace barrel — only DashboardBillingQuota is statically consumed;
    // the other 105 handles are mirror entries of translation.ts (registers namespaces via side-effect)
    "shared/locale/namespaces/index.ts",
    // Meeting type barrel — re-exports ~30 types from 3 sub-type files; 28 flagged
    // entries are unused re-export fanout, not dead code
    "backend/types/meeting/index.ts",
    // WhatsApp Cloud API barrel — author-documented public-API surface for Meta Cloud API v1;
    // flagged members are awaiting integration-test consumers
    "backend/services/communication/channels/whatsapp/cloud-api/index.ts",

    // Curated catalog helper surfaces — partially-consumed public API surfaces that mirror
    // other catalog patterns (currency.ts); removing "unused" entries risks dropping valid options
    "frontend/lib/payment-method.ts",
  ],

  // External CLI tool spawned at runtime via child_process.spawn — not an npm binary
  // knip can resolve.
  ignoreBinaries: ["copilot"],

  // Tooling-only / lifecycle dependencies not statically imported from any source file.
  // These are spell-check dicts and duplicate scanner.
  // Conservative starter set — re-run knip after entry changes to verify remaining deps.
  ignoreDependencies: ["lint-staged", "jscpd", "@cspell/dict-ar", "@cspell/eslint-plugin"],
};

export default config;
