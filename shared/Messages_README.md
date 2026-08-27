# Messages / i18n Architecture

This directory contains the **translation type definitions** and **locale-specific translation files** for the application, powered by [next-intl](https://next-intl.dev/).

## Directory Structure

```
shared/messages/
├── README.md              ← You are here
├── ar.ts                  ← Arabic root re-export (typed as MessageSchema)
├── en.ts                  ← English monolithic file (TO BE MIGRATED — see plan)
├── ar/                    ← Arabic translations (fully split by domain)
│   ├── index.ts           ← Assembles all Arabic translations
│   ├── errors.ts
│   ├── auth/
│   ├── common/
│   └── dashboard/
│       ├── admin/
│       ├── billing/
│       ├── classes/
│       ├── complaints/
│       ├── core/
│       ├── managers/
│       ├── parents/
│       ├── permissions.ts
│       ├── reports/
│       ├── resources/
│       ├── students/
│       ├── suggestions/
│       └── teachers/
├── en/                    ← English translations (partially split — migration in progress)
│   ├── index.ts
│   ├── errors.ts
│   └── dashboard/
│       ├── complaints/
│       └── resources/
└── types/                 ← Type definitions (one file per domain)
    ├── message.ts         ← Master MessageSchema type (composes all label types)
    ├── auth/
    │   └── index.ts
    ├── common/
    │   └── index.ts
    ├── errors/            ← Error labels (split by domain)
    │   ├── index.ts       ← Re-exports ErrorsLabels + sub-types
    │   ├── main.ts        ← ErrorsLabels interface (top-level keys + nested refs)
    │   ├── teacher.ts
    │   ├── parent.ts
    │   ├── staff.ts
    │   ├── manager.ts
    │   ├── auth.ts
    │   ├── user.ts
    │   ├── permission.ts
    │   ├── complaint.ts
    │   ├── complaintResponse.ts
    │   └── suggestion.ts
    ├── session/           ← Session labels
    │   ├── index.ts
    │   └── main.ts
    └── dashboard/
        ├── admin/
        ├── billing/
        ├── classes/
        ├── complaints/
        ├── core/
        ├── managers/
        ├── parents/
        ├── permissions/
        │   ├── index.ts
        │   └── main.ts
        ├── reports/
        ├── resources/
        ├── students/
        ├── suggestions/
        └── teachers/
```

## Conventions

### Type-First Development
1. **Define label interfaces** in `types/` — one interface per domain, organized to mirror `frontend/views/dashboard/` structure
2. **Compose** into `MessageSchema` in `types/message.ts`
3. **Implement** translations in locale directories (`ar/`, `en/`) — each typed as `MessageSchema` for compile-time safety

### File Organization Rules
- **Every domain gets its own directory** under `types/` — no standalone `.ts` type files except `message.ts`
- **Each domain directory** has a `main.ts` (contains the label interface) and `index.ts` (re-exports)
- **Nested sub-objects** (like `ErrorsLabels.teacher`, `ErrorsLabels.complaint`) get their own files within the domain directory
- **Both locales must have identical key structures** — enforced by `MessageSchema` typing

### Adding a New Translation Domain
1. Create `types/<domain>/main.ts` with the label interface
2. Create `types/<domain>/index.ts` re-exporting it
3. Import and add the type to `MessageSchema` in `types/message.ts`
4. Add the translation key in both `ar/` and `en/` locale files

### Naming
- Type names follow the pattern: `{Domain}Labels` (e.g., `BillingLabels`, `ComplaintsLabels`)
- Export names in locale files match the `MessageSchema` key (e.g., `dashboard.billing` → `billing` export)

## Consumers
- **Frontend**: `useTranslations("dashboard.billing")` from `next-intl` — typed via `MessageSchema`
- **Backend**: `getBackendTranslations({ locale, namespace: "errors" })` — returns translation function

## Migration Status
- Arabic (`ar/`): Fully split by domain
- English (`en/`): **Monolithic** in `en.ts` (2251 lines). Partial split started in `en/`. Full migration pending.
