# Plan Review Report — <feature-name>

## Review Round: <N>
## Date: <YYYY-MM-DD>
## Subagents Dispatched: <list>

---

## Summary

- **Total issues found:** <N>
- **Blocking (CRITICAL/HIGH):** <N>
- **Medium:** <N>
- **Low/Notes:** <N>

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths Existence | verify-paths-exist | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| i18n Compliance | verify-i18n-namespaces | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| GraphQL Accuracy | verify-graphql-accuracy | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| Component Props | verify-component-props | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| Permissions/Enums | verify-permissions-enums | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| Existing Components | verify-existing-components | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| Architecture Compliance | verify-three-tier-architecture | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |
| Cross-Reference Consistency | verify-cross-ref-consistency | <N> | ✅ Fixed / ⚠️ Partial / ❌ Blocked |

---

## Detailed Findings

### Dimension 1: <Name>

**Subagent:** `<subagent-name>`

**Findings:**

1. **[CRITICAL/HIGH/MEDIUM/LOW]** <Issue description>
   - **Location:** `<file>:<line>` or `<section>`
   - **Expected:** <correct pattern>
   - **Actual:** <incorrect pattern found>
   - **Fix Applied:** <description of fix>

2. ...

### Dimension 2: <Name>

...

---

## Fix Subagents Dispatched

| Subagent | Target Files | Findings Fixed | Status |
|---|---|---|---|
| fix-requirements | `specs.md` | <N> fixes | ✅ Complete |
| fix-design | `implementation.md`/`design.md` | <N> fixes | ✅ Complete |
| fix-tasks | `trackable-tasks.md` | <N> fixes | ✅ Complete |

---

## Post-Fix Verification

- [ ] All stale references resolved (grep confirms)
- [ ] New tasks/components added where needed
- [ ] AC traceability complete
- [ ] Quality loop passes on all plan files (`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit code 0)
- [ ] Re-run `@plan-review` confirms "Plan passes all AGENTS.md rules"

**Verification command:**
```bash
# Run the unified per-file quality loop on modified plan files
# (runs tsgo → oxlint → biome → lint:type-aware → check:duplicates --file)
bun run scripts/health/sub-loop.ts specs.md --lifecycle duplicates
bun run scripts/health/sub-loop.ts implementation.md --lifecycle duplicates
bun run scripts/health/sub-loop.ts trackable-tasks.md --lifecycle duplicates
```

---

## Lessons for Future Plans

- <Bullet point 1: Pattern discovered, anti-pattern avoided, or process improvement>
- <Bullet point 2>
- ...

---

## Traceability

**Plan files modified:**
- `specs.md` — <summary of changes>
- `implementation.md`/`design.md` — <summary of changes>
- `trackable-tasks.md` — <summary of changes>

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/<feature-name>/outcome/plan-review-R<N>.md`

---

## Next Steps

- [ ] Commit patched plan files
- [ ] Proceed to implementation (Phase 1: Foundation)
- [ ] OR: Run another review round if issues remain (increment R<N+1>)
