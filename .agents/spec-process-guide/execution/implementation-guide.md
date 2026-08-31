# Task Execution Documentation

<!-- Navigation Metadata -->
<!-- Execution: Implementation | Level: Detailed Guide | Prerequisites: process/tasks-phase.md -->
<!-- Related: templates/tasks-template.md, examples/simple-feature-spec.md, quality-assurance.md -->

**📍 You are here:** [Main Guide](../../README.md) → [Execution Guide](README.md) → **Implementation Guide**

## Quick Navigation
- **📋 Prerequisites:** [Tasks Phase](../process/tasks-phase.md) - Learn how to create implementation plans
- **📝 Task Template:** [Tasks Template](../templates/tasks-template.md) - Structure your implementation plan
- **📖 See Example:** [Simple Feature Tasks](../examples/simple-feature-spec.md#tasks-document) - Complete task example
- **✅ Quality Control:** [Quality Assurance](quality-assurance.md) - Maintain code quality

---

## Overview

This guide provides step-by-step strategies for implementing features from completed specs, maintaining quality throughout the development process, and handling common implementation challenges.

## Pre-Implementation Setup

### 0. Pre-Implementation Baseline (MANDATORY — Phase 0)
Before ANY implementation work, establish error baseline:

```bash
# Record tsgo error count
bun tsgo 2>&1 | grep "error TS" | wc -l > /tmp/baseline-tsgo.txt

# Record biome warnings
bun biome:check 2>&1 | grep -c "warn" > /tmp/baseline-biome.txt

# Record lint output
bun run scripts/lint-service.ts --json --id baseline > /tmp/baseline-lint.json
```

**Create deferred-items ledger:**
```bash
cp .agents/spec-process-guide/templates/deferred-items-template.md ai/plans/<feature-name>/deferred-items.md
```

**Why this matters:** Distinguishes new errors (introduced by your work) from pre-existing errors. Four implementations showed baseline confusion caused wasted debugging time.

### 1. Spec Validation
Before starting implementation, ensure your spec is complete:

- **Requirements Review**: All user stories have clear acceptance criteria (including Requirement 0 baseline + 0.5 i18n/enum compliance)
- **Design Completeness**: Architecture, concurrency assessment, and components well-defined
- **Task Clarity**: Each task is actionable with clear deliverables
- **Dependency Mapping**: Task order and dependencies understood
- **Plan Review Gate (Phase 1.5)**: Plan has passed `@plan-review` skill with zero violations

### 2. Environment Preparation
Set up your development environment:

```bash
# Ensure development dependencies are installed
# Set up testing framework
# Configure code quality tools (linting, formatting)
# Prepare version control branching strategy
```

### 3. Task Prioritization
Review the task list and identify:
- **Critical Path**: Tasks that block other work
- **Quick Wins**: Simple tasks that provide early validation
- **Risk Areas**: Complex tasks that may need extra attention
- **Integration Points**: Tasks that connect different components

## Task Execution Strategy

### Single Task Focus Approach

**Rule**: Implement one task at a time, completely, before moving to the next.

#### Step 1: Task Analysis
Before coding, analyze the current task:

1. **Read Task Details**: Understand what needs to be built
2. **Review Requirements**: Check which requirements this task addresses
3. **Check Dependencies**: Ensure prerequisite tasks are complete
4. **Plan Implementation**: Outline your approach before coding

#### Step 2: Implementation Process

```markdown
For each task:
1. Update task status to "in progress"
2. Create/modify necessary files
3. Write tests (if applicable)
4. Implement functionality
5. Validate against requirements
6. Update task status to "complete"
7. Commit changes with clear message
```

#### Step 3: Validation Checkpoint
After completing each task:
- **Functionality Test**: Does it work as specified?
- **Requirements Check**: Are the referenced requirements satisfied?
- **Integration Test**: Does it work with existing code?
- **Code Quality**: Is it maintainable and well-documented?

### Implementation Patterns

#### Test-Driven Development Integration
When tasks involve testable functionality:

1. **Write Tests First**: Based on acceptance criteria
2. **Implement to Pass**: Write minimal code to satisfy tests
3. **Refactor**: Improve code quality while maintaining tests
4. **Validate**: Ensure all requirements are met

#### Incremental Building
For complex tasks:

1. **Start Simple**: Implement basic functionality first
2. **Add Complexity**: Layer on additional features
3. **Validate Frequently**: Test after each increment
4. **Document Decisions**: Record any deviations from the plan

## Quality Maintenance Strategies

### Code Quality Gates (EXPANDED)

#### Before Starting Each Task
- [ ] Read ALL existing outcome files in `ai/plans/<feature-name>/outcome/`
- [ ] Understand the task requirements completely
- [ ] Have a clear implementation plan
- [ ] Know how you'll test the functionality
- [ ] Understand how it fits with existing code

#### During Implementation (Per-File Quality Loop)
After modifying ANY file, run immediately:
```bash
bun tsgo
bun biome:check
bun run scripts/lint-service.ts -f <file-path> --id verify
```

#### Semantic Review Checklist (Before Marking Complete)
- [ ] **Race Conditions**: No read-then-write without atomicity (SELECT FOR UPDATE / tx / advisory lock)
- [ ] **Env-Config**: All `resolveEnvConfig` calls registered in `env-config-keys.ts`
- [ ] **Cache Invalidation**: All `resetX()` functions invalidate all resolved keys
- [ ] **Dead Code**: No unreachable branches
- [ ] **Cross-Layer**: No frontend→backend or shared→frontend/backend imports
- [ ] **Enum Imports**: Enums used at runtime imported as values (not `import type`)
- [ ] **Schema Sync**: Migration columns exist in Drizzle schema
- [ ] **Deferred Items**: All deferred work logged in `deferred-items.md`

#### After Completing Each Task
- [ ] All tests pass
- [ ] Code meets quality standards
- [ ] Semantic review checklist complete
- [ ] Functionality matches requirements
- [ ] Integration with existing code works
- [ ] Documentation is updated
- [ ] Outcome file written: `ai/plans/<feature-name>/outcome/<task-id>-outcome.md`

### Continuous Integration Practices

#### Version Control Strategy
```bash
# Create feature branch for the spec
git checkout -b feature/spec-name

# Commit after each completed task
git add .
git commit -m "Complete task X.Y: [task description]"

# Push regularly to backup work
git push origin feature/spec-name
```

#### Code Review Checkpoints
- **Self Review**: Review your own code before marking tasks complete
- **Peer Review**: Get feedback on complex or critical tasks
- **Architecture Review**: Validate major design decisions
- **Final Review**: Complete review before merging

## Handling Implementation Challenges

### Common Challenge Types

#### 1. Requirements Ambiguity
**Symptoms**: Unclear what to build, multiple interpretations possible
**Solutions**:
- Document the ambiguity clearly
- Make reasonable assumptions and document them
- Implement the simplest interpretation first
- Flag for clarification with stakeholders

#### 2. Technical Complexity
**Symptoms**: Task seems much harder than expected
**Solutions**:
- Break the task into smaller sub-tasks
- Research alternative approaches
- Implement a simplified version first
- Consider updating the design if needed

#### 3. Integration Issues
**Symptoms**: New code doesn't work well with existing systems
**Solutions**:
- Review the design for integration points
- Create adapter layers if needed
- Update interfaces to accommodate new functionality
- Consider refactoring existing code if beneficial

#### 4. Performance Problems
**Symptoms**: Implementation is too slow or resource-intensive
**Solutions**:
- Profile to identify bottlenecks
- Optimize critical paths first
- Consider algorithmic improvements
- Document performance characteristics

### Blocker Resolution Process

#### Step 1: Identify the Blocker
- **Technical**: Missing knowledge, complex implementation
- **Requirements**: Unclear specifications, conflicting needs
- **Dependencies**: Waiting for other tasks, external systems
- **Resources**: Missing tools, access, or information

#### Step 2: Document the Issue
```markdown
## Blocker Report
- **Task**: [Task number and description]
- **Issue**: [Clear description of the problem]
- **Impact**: [How this affects the project]
- **Attempted Solutions**: [What you've tried]
- **Proposed Resolution**: [Your suggested approach]
```

#### Step 3: Resolution Strategies
- **Research**: Look for solutions, best practices, examples
- **Simplify**: Reduce scope or complexity temporarily
- **Workaround**: Implement alternative approach
- **Escalate**: Get help from team members or stakeholders

#### Step 4: Update Documentation
- Record the resolution in project documentation
- Update the spec if the solution changes the design
- Share learnings with the team

## Progress Tracking and Communication

### Task Status Management
Keep task status current:
- **Not Started**: Task hasn't been begun
- **In Progress**: Actively working on the task
- **Blocked**: Cannot proceed due to external factors
- **Complete**: Task fully implemented and validated

### Progress Reporting
Regular updates should include:
- **Completed Tasks**: What's been finished
- **Current Focus**: What you're working on now
- **Upcoming Work**: Next tasks in the queue
- **Blockers**: Any issues preventing progress
- **Timeline**: Expected completion dates

### Documentation Updates
As you implement:
- **Code Comments**: Explain complex logic and decisions
- **README Updates**: Keep setup and usage instructions current
- **Architecture Notes**: Document any design changes
- **Lessons Learned**: Record insights for future projects

## Adaptation and Flexibility

### When to Deviate from the Plan

#### Acceptable Deviations
- **Better Technical Solution**: Found a superior approach
- **Simplified Implementation**: Can achieve the same result more easily
- **Performance Optimization**: Discovered efficiency improvements
- **Code Reuse**: Can leverage existing components

#### Process for Changes
1. **Document the Proposed Change**: Why and what will be different
2. **Assess Impact**: How does this affect other tasks or requirements
3. **Update Documentation**: Modify spec documents if needed
4. **Communicate**: Inform stakeholders of significant changes
5. **Validate**: Ensure requirements are still met

### Iterative Improvement
- **Retrospectives**: Regular review of what's working and what isn't
- **Process Refinement**: Adjust approach based on experience
- **Tool Evaluation**: Consider better tools or techniques
- **Knowledge Sharing**: Document insights for future projects

## Post-Implementation Knowledge Propagation

After all implementation tasks are complete, the final mandatory step is to propagate learnings from the plan's outcome files back into the project's permanent knowledge base.

### Why This Matters

Plan outcome files (`ai/plans/<feature-name>/outcome/`) contain valuable research, patterns, gotchas, and conventions discovered during implementation. Without propagation, this knowledge is buried in plan-specific files and future agents/developers will repeat the same mistakes or miss established patterns.

### The `docs/` Directory

The project's canonical technical documentation lives under `docs/` at the repo root. Each domain has its own subdirectory:

```
docs/
├── drizzle/          # Drizzle ORM patterns, prepared statements, migrations
├── auth/             # Authentication, sessions, impersonation
├── bun/              # Bun runtime specifics
├── frontend/         # (create if needed) Frontend patterns
├── graphql/          # (create if needed) GraphQL patterns
├── testing/          # (create if needed) Testing patterns
├── IDEMPOTENCY.md    # Top-level single-topic doc
└── ...
```

**Creating a new docs file:**
1. If a matching subdirectory exists, create the file inside it: `docs/<domain>/<topic>.md`
2. If no matching subdirectory exists, create one: `mkdir -p docs/<domain>/`
3. File naming: `kebab-case.md` (e.g., `prepared-statements.md`, `dataloader-batching.md`)
4. If the topic is a single standalone concern, a top-level `docs/<TOPIC>.md` is acceptable

**Docs file structure:**
```markdown
# <Topic Title>
Brief summary of what this doc covers and why it exists.

## Why <Pattern>
Motivation — what problem does this solve.

## The Pattern
Canonical code pattern with annotated examples. Include imports.

## Rules / Conventions
Mandatory rules. Use MUST/MUST NOT.

## What NOT to Do
Anti-patterns and common mistakes.

## Rollout Summary (if from a plan)
Table of files modified, methods refactored, test results.

## Related Documents
- `path/to/AGENTS.md` — description
- `path/to/other-doc.md` — description
```

### How AGENTS.md References Docs

```markdown
## Rules
- **Topic (CRITICAL)**: Rule description. See `docs/<domain>/<topic>.md` for the complete pattern reference.
```

Root `AGENTS.md` Important References:
```markdown
## Important References
- `docs/<domain>/<topic>.md` - Brief description
```

### How Skills Reference Docs

```markdown
## <Topic Section>
When working with <files>, follow the pattern documented in `docs/<domain>/<topic>.md`. Key rules:
- Rule 1
- Rule 2
```

### How Instructions Reference Docs

```markdown
## Required Reading
Before modifying <files>, read:
- `docs/<domain>/<topic>.md` — Pattern description
```

### Knowledge Propagation Steps

1. **Read all outcome files** in `ai/plans/<feature-name>/outcome/` to synthesize all learnings
2. **Create a canonical reference doc** under `docs/<domain>/<topic>.md` following the structure above
3. **Update layer AGENTS.md files** with new rules/patterns and a reference to the new doc
4. **Update `.agents/skills/<skill>/SKILL.md`** if new patterns affect a skill's domain
5. **Update `.agents/instructions/<layer>.instructions.md`** if new conventions should be enforced
6. **Update root `AGENTS.md`** Important References section with the new doc
7. **Run quality checks**: `bun tsgo`, `bun biome:check`, `bun run lint`

### Complete Domain-to-Artifacts Mapping

| Plan Domain | Docs Subdir | AGENTS.md to Update | Skills to Update | Instructions to Update |
|---|---|---|---|---|
| Drizzle / DB patterns | `docs/drizzle/` | `backend/db/repo/AGENTS.md`, `backend/db/schema/AGENTS.md`, `backend/AGENTS.md` | `.agents/skills/drizzle/SKILL.md` | `.agents/instructions/backend.instructions.md` |
| DB migrations | `docs/drizzle/` | `backend/db/schema/AGENTS.md`, `backend/AGENTS.md` | `.agents/skills/drizzle-migrations/SKILL.md`, `.agents/skills/drizzle-generate/SKILL.md` | `.agents/instructions/backend.instructions.md` |
| GraphQL / Pothos | `docs/graphql/` | `backend/graphql/AGENTS.md`, `backend/graphql/pothos/AGENTS.md`, `frontend/graphql/AGENTS.md` | — | `.agents/instructions/backend.instructions.md` |
| Backend services | `docs/services/` | `backend/services/AGENTS.md`, `backend/AGENTS.md` | — | `.agents/instructions/backend.instructions.md` |
| Backend types / enums | `docs/backend/` | `backend/types/AGENTS.md`, `backend/enum/AGENTS.md`, `backend/AGENTS.md` | — | `.agents/instructions/backend.instructions.md` |
| Frontend components / views | `docs/frontend/` | `frontend/AGENTS.md`, `frontend/views/AGENTS.md`, `frontend/components/ui/AGENTS.md` | `.agents/skills/frontend-patterns/SKILL.md` | `.agents/instructions/frontend.instructions.md` |
| Frontend mobile/desktop | `docs/frontend/` | `frontend/mobile/AGENTS.md`, `frontend/desktop/AGENTS.md`, `frontend/views/AGENTS.md` | `.agents/skills/refactor-mobile-desktop/SKILL.md` | `.agents/instructions/mobile-desktop.instructions.md` |
| Frontend stores / state | `docs/frontend/` | `frontend/stores/AGENTS.md`, `frontend/AGENTS.md` | `.agents/skills/frontend-patterns/SKILL.md` | `.agents/instructions/frontend.instructions.md` |
| Frontend GraphQL / Apollo | `docs/frontend/` | `frontend/graphql/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md` | — | `.agents/instructions/frontend.instructions.md` |
| Testing (DB) | `docs/testing/` | `backend/db/test/AGENTS.md`, `backend/db/test/logic/AGENTS.md` | `.agents/skills/fix-db-tests/SKILL.md` | `.agents/instructions/tests.instructions.md` |
| Testing (UI / E2E) | `docs/testing/` | `test/ui/AGENTS.md` | `.agents/skills/fix-tests/SKILL.md` | `.agents/instructions/tests.instructions.md` |
| Testing (general) | `docs/testing/` | `scripts/run-test/AGENTS.md` | `.agents/skills/fix-tests/SKILL.md` | `.agents/instructions/tests.instructions.md` |
| i18n / locale | `docs/i18n/` | `shared/AGENTS.md` | — | — |
| Auth / security | `docs/auth/` | `backend/services/AGENTS.md`, `backend/AGENTS.md` | `.agents/skills/security-review/SKILL.md` | `.agents/instructions/backend.instructions.md` |
| App Router / Next.js | `docs/app/` | `app/AGENTS.md` | — | `.agents/instructions/frontend.instructions.md` |
| Quality gates / CI | `docs/quality/` | `AGENTS.md` (root) | `.agents/skills/quality-gate/SKILL.md`, `.agents/skills/quality-loop/SKILL.md` | — |
| Idempotency | `docs/` (top-level) | `backend/services/AGENTS.md` | — | `.agents/instructions/backend.instructions.md` |
| Bun / runtime | `docs/bun/` | `AGENTS.md` (root) | — | — |

## Success Metrics

### Task-Level Success
- **Functionality**: Feature works as specified
- **Quality**: Code meets standards and is maintainable
- **Testing**: Appropriate tests are in place and passing
- **Documentation**: Implementation is properly documented

### Project-Level Success
- **Requirements Satisfaction**: All acceptance criteria are met
- **Timeline Adherence**: Project completed within expected timeframe
- **Quality Standards**: Code quality metrics are satisfied
- **Stakeholder Satisfaction**: Delivered feature meets user needs

---

[← Back to Execution Guide](README.md) | [Quality Assurance →](quality-assurance.md)