# Execution Troubleshooting

<!-- Navigation Metadata -->
<!-- Execution: Troubleshooting | Level: Problem Solving | Prerequisites: execution/implementation-guide.md -->
<!-- Related: examples/troubleshooting-pitfalls.md, quality-assurance.md, process/tasks-phase.md -->

**📍 You are here:** [Main Guide](../../README.md) → [Execution Guide](README.md) → **Troubleshooting**

## Quick Navigation
- **Implementation:** [Implementation Guide](implementation-guide.md) - Step-by-step execution strategies
- **Quality:** [Quality Assurance](quality-assurance.md) - Testing and validation techniques
- **Process Issues:** [Troubleshooting & Pitfalls](../examples/troubleshooting-pitfalls.md) - Spec process problems
- **Task Planning:** [Tasks Phase](../process/tasks-phase.md) - Create better task breakdowns

---

## Common Implementation Issues and Solutions

This guide addresses common problems that arise during the execution phase when implementing features from completed specs. For broader spec process issues, see the [Troubleshooting & Pitfalls guide](../examples/troubleshooting-pitfalls.md).

## Issue 1: Spec and Reality Diverge

### Problem
During implementation, you discover the spec doesn't match reality—existing code works differently than documented, APIs have changed, or technical constraints weren't captured.

### Symptoms
- Code structure doesn't match spec assumptions
- Required APIs or libraries are unavailable or deprecated
- Performance characteristics differ from spec expectations
- Integration points work differently than specified

### Solutions

**Immediate Actions:**
1. **Document the gap** - Write down exactly what differs from the spec
2. **Assess impact** - Is this a minor detail or fundamental design issue?
3. **Don't proceed blindly** - Stop implementing until you understand implications

**Resolution Steps:**

```markdown
# Option 1: Update Spec (Minor deviations)
If the difference is minor and doesn't affect requirements:
1. Update design section with actual approach
2. Adjust affected tasks
3. Document why the change was needed
4. Continue implementation

# Option 2: Redesign (Major deviations)
If core assumptions are wrong:
1. Return to design phase
2. Incorporate new understanding
3. Re-validate against requirements
4. Create new task breakdown
5. Restart implementation with corrected plan

# Option 3: Adjust Requirements (Fundamental issues)
If requirements can't be met as stated:
1. Document why requirements aren't achievable
2. Propose alternative approach
3. Get stakeholder approval
4. Update entire spec
5. Restart process
```

**Prevention:**
- During design phase, validate assumptions with code exploration
- Prototype risky integrations before finalizing spec
- Include technical spikes in task breakdown for uncertain areas

## Issue 2: Task Dependencies Block Progress

### Problem
You start a task only to discover it depends on something not yet implemented, or you need to work on multiple tasks simultaneously to make progress.

### Symptoms
- Can't complete task without features from later tasks
- Multiple tasks require changes to the same file/component
- Test setup needs features not yet built
- Circular dependencies between tasks

### Solutions

**Immediate Actions:**
1. **Map the dependency** - Identify what's actually needed
2. **Check if task breakdown was wrong** - Were dependencies missed in planning?
3. **Look for workarounds** - Can you mock/stub dependencies temporarily?

**Resolution Strategies:**

```markdown
# Strategy 1: Reorder Tasks
If dependency was missed in planning:
1. Identify the prerequisite task
2. Complete it first
3. Return to blocked task
4. Update task sequence in spec for future reference

# Strategy 2: Split Tasks
If task is too large:
1. Break blocked task into smaller pieces
2. Complete parts that aren't blocked
3. Queue dependent parts for later
4. Update task breakdown in spec

# Strategy 3: Use Mocking/Stubbing
If dependency is complex:
1. Create minimal stub/mock of dependency
2. Complete current task against stub
3. Replace stub when real dependency is ready
4. Add integration testing task

# Strategy 4: Parallel Development
If dependency is in progress:
1. Define clear interface/contract
2. Implement against interface
3. Test with mock implementation
4. Integrate when dependency completes
```

**Prevention:**
- During task planning, explicitly map dependencies
- Order tasks to minimize blocking
- Identify tasks that can be parallelized
- Include stub/mock tasks where needed

## Issue 3: Requirements Unclear During Implementation

### Problem
While coding, you encounter scenarios not covered in requirements or acceptance criteria that seem ambiguous.

### Symptoms
- Multiple valid interpretations of a requirement
- Edge cases not addressed in spec
- Conflicting requirements discovered
- User experience details missing

### Solutions

**Immediate Actions:**
1. **Don't guess** - Assumptions during coding are expensive mistakes
2. **Document the question** - Write down exactly what's unclear
3. **Check related requirements** - See if answer exists elsewhere in spec

**Resolution Process:**

```markdown
# Step 1: Analyze the Ambiguity
- What exactly is unclear?
- What are the possible interpretations?
- What's the impact of each interpretation?
- Is this a common scenario or edge case?

# Step 2: Propose Solution
- What would be most consistent with existing requirements?
- What aligns with user needs?
- What's technically simplest?
- Make a recommendation with rationale

# Step 3: Get Clarification
- Update requirements with clarification
- Update acceptance criteria if needed
- Document decision rationale
- Proceed with implementation

# Step 4: Update Tasks
- Adjust current task if needed
- Add new tasks if solution is more complex
- Update testing tasks to cover clarified scenario
```

**Prevention:**
- During requirements phase, actively probe for edge cases
- Use examples and scenarios to clarify requirements
- Review requirements with developers before design phase
- Include "questions to resolve" section in early specs

## Issue 4: Technical Debt Creates Implementation Friction

### Problem
Existing codebase quality issues make implementing the spec much harder than anticipated.

### Symptoms
- Need to refactor before adding feature
- Tests are brittle or missing
- Code is tightly coupled
- No clear extension points

### Solutions

**Immediate Actions:**
1. **Assess refactoring scope** - How much cleanup is needed?
2. **Evaluate risk** - What breaks if you refactor? What breaks if you don't?
3. **Don't mix concerns** - Separate refactoring from feature work

**Resolution Strategies:**

```markdown
# Strategy 1: Refactor-First Approach
If refactoring is bounded and low-risk:
1. Create refactoring tasks separate from feature tasks
2. Get approval for additional work
3. Complete refactoring with tests
4. Proceed with feature implementation
5. Document refactoring in spec notes

# Strategy 2: Parallel Track
If refactoring is extensive:
1. Implement feature with workarounds
2. Create separate refactoring initiative
3. Document technical debt created
4. Plan future cleanup
5. Add notes to design about ideal approach

# Strategy 3: Incremental Improvement
If refactoring can be done in pieces:
1. Refactor only what you touch
2. Leave code better than you found it
3. Add tests for refactored areas
4. Document improvements
5. Continue feature implementation
```

**Prevention:**
- During design phase, assess existing code quality
- Include refactoring tasks in task breakdown when needed
- Set realistic timelines that account for technical debt
- Advocate for periodic refactoring initiatives

## Issue 5: Tests Failing or Hard to Write

### Problem
Test implementation is much harder than expected, tests are flaky, or coverage is insufficient.

### Symptoms
- Tests fail randomly
- Setup code is complex
- Mocking is complicated
- Tests take too long to run
- Hard to test certain scenarios

### Solutions

**Test Architecture Issues:**

```markdown
# Problem: Tightly Coupled Code
Solution:
- Extract interfaces for dependencies
- Use dependency injection
- Create test fixtures/factories
- Implement test doubles

# Problem: Complex Setup
Solution:
- Create reusable test utilities
- Use test builders/factories
- Implement setup helpers
- Share fixtures across tests

# Problem: Flaky Tests
Solution:
- Remove timing dependencies
- Eliminate global state
- Mock external dependencies
- Use deterministic test data

# Problem: Slow Tests
Solution:
- Use test doubles for expensive operations
- Parallelize test execution
- Optimize database setup/teardown
- Cache expensive setups
```

**Coverage Gaps:**

```markdown
# Missing Test Cases
1. Review acceptance criteria - did we miss scenarios?
2. Check edge cases - are they all tested?
3. Verify error paths - do tests cover failures?
4. Add missing tests before completing task

# Wrong Test Level
1. Unit test business logic
2. Integration test component interactions
3. E2E test critical user workflows
4. Don't over-test at wrong level
```

**Prevention:**
- Design for testability during design phase
- Include test strategy in design document
- Write tests as you implement features
- Review test coverage before marking tasks complete

## Issue 6: Performance Problems

### Problem
Implementation works correctly but doesn't meet performance requirements.

### Symptoms
- Slow response times
- High memory usage
- Database query issues
- Excessive network calls

### Solutions

**Diagnostic Process:**

```markdown
# Step 1: Measure
- Profile the code
- Identify bottlenecks
- Quantify the gap
- Establish baseline

# Step 2: Analyze
- Is it algorithmic complexity?
- Database query inefficiency?
- Network latency?
- Resource contention?

# Step 3: Optimize
- Target the biggest bottleneck first
- Make one change at a time
- Measure after each change
- Document optimizations

# Step 4: Validate
- Verify requirements are now met
- Check no regressions occurred
- Update tests with performance assertions
- Document performance characteristics
```

**Common Fixes:**

```markdown
# Database Issues
- Add indexes
- Optimize queries
- Use appropriate joins
- Implement caching
- Batch operations

# Algorithm Issues
- Use appropriate data structures
- Reduce time complexity
- Cache computed values
- Lazy load when possible

# Network Issues
- Batch requests
- Implement caching
- Use compression
- Reduce payload size
```

**Prevention:**
- Include performance requirements in spec
- Design with performance in mind
- Profile early and often
- Include performance tests

## Issue 7: Integration Problems

### Problem
Your feature works in isolation but fails when integrated with other components or services.

### Symptoms
- Works locally, fails in integration environment
- Timing issues in production
- Data format mismatches
- Authentication/authorization failures

### Solutions

**Integration Debugging:**

```markdown
# Step 1: Isolate the Problem
- Does it work in isolation?
- Which integration point fails?
- Is it consistent or intermittent?
- What's different in integration environment?

# Step 2: Verify Contracts
- Check API specifications
- Validate data formats
- Verify authentication flow
- Review error responses

# Step 3: Test Integration Points
- Test each integration separately
- Use integration test environment
- Verify error handling
- Check timeout behavior

# Step 4: Fix and Validate
- Implement fix for integration issue
- Add integration tests
- Verify in integration environment
- Update spec if assumptions were wrong
```

**Common Integration Issues:**

```markdown
# Configuration Differences
- Environment variables
- Service URLs
- Authentication credentials
- Feature flags

# Data Format Issues
- Date/time formats
- Encoding differences
- Null handling
- Optional fields

# Timing Issues
- Race conditions
- Timeout values
- Async operation handling
- Event ordering
```

**Prevention:**
- Test in integration environment early
- Document integration requirements clearly
- Include integration tests in task breakdown
- Validate integration points during design

## Issue 8: Scope Creep During Implementation

### Problem
While implementing, you discover opportunities for improvements or additional features not in the spec.

### Symptoms
- "While I'm here, I should also..."
- "It would be easy to add..."
- Tasks taking longer than estimated
- Feature complexity growing

### Solutions

**Discipline Process:**

```markdown
# Step 1: Recognize It
- Notice when you're going beyond spec
- Identify additions vs requirements
- Assess whether it's scope creep

# Step 2: Evaluate It
- Is it required for current requirements?
- Is it a bug fix or enhancement?
- What's the cost of doing it now vs later?

# Step 3: Decide
Option A: Required for current feature
  - Update spec with new requirement
  - Add to current work
  - Adjust timeline
  
Option B: Nice to have but not required
  - Document as future enhancement
  - Complete current spec first
  - Create separate spec for enhancement
  
Option C: Out of scope
  - Note in spec as explicitly excluded
  - Create future spec if valuable
  - Stay focused on current work
```

**Red Flags:**
- "Just one more feature"
- "While we're changing this..."
- Refactoring beyond what's needed
- Gold-plating solutions

**Prevention:**
- Clear requirements and acceptance criteria
- Regular review against spec
- Time-box implementation tasks
- Separate enhancement ideas from current work

## Debugging Strategies

### Strategy 1: Rubber Duck Debugging
Explain the problem out loud or in writing. Often the act of explaining reveals the solution.

### Strategy 2: Binary Search
Isolate the problem by dividing the code in half repeatedly until you find the issue.

### Strategy 3: Add Logging
Strategic logging helps understand code flow and data transformations.

### Strategy 4: Minimal Reproduction
Create smallest possible test case that reproduces the issue.

### Strategy 5: Compare Working vs Broken
Find similar code that works and compare differences.

## When to Update the Spec

**Always Update When:**
- Design assumptions were wrong
- Requirements need clarification
- Tasks need reordering or splitting
- New edge cases discovered
- Technical approach changes

**Document in Spec:**
- Why changes were made
- When they were made
- Impact on timeline
- Alternatives considered

**Never:**
- Hide problems by not documenting
- Make spec changes without understanding impact
- Skip updating spec because "it's just one thing"

## Getting Unstuck

When you're truly blocked:

1. **Take a break** - Sometimes the solution comes when you step away
2. **Review the spec** - Re-read requirements and design
3. **Ask for help** - Get a second pair of eyes
4. **Simplify** - Can you solve a simpler version first?
5. **Prototype** - Try multiple approaches quickly
6. **Go back a phase** - Maybe the spec needs work

---

## Summary

Implementation problems are normal. The key is to:
- **Catch issues early** through iterative testing
- **Document problems** and solutions
- **Update specs** when reality diverges
- **Stay focused** on requirements
- **Ask for help** when blocked

Good troubleshooting makes you a better developer and improves the spec process for everyone.

---

## Common Pitfalls from Real Implementations (Evidence-Based)

These pitfalls emerged from four completed feature implementations (auto-meeting-url, cron, quota, whatsapp) totaling 80+ tasks.

### Issue: Type Cascade Across Files

**Problem:** Renaming a type (e.g., `Student` → `StudentReturnType`) breaks 8+ consumer files, but per-file `bun tsgo` misses this because it compiles against local imports only.

**Symptoms:**
- Quality loop passes ✅ for the type file
- Downstream consumer files fail with "Cannot find name 'Student'"
- Errors discovered late (Phase 4 or post-implementation review)

**Solution:**
- Add **Phase-Boundary Type Coherence Gate**: Run full `bun tsgo` after each major phase
- Compare error count vs pre-phase baseline
- Fix all new type errors before proceeding

**Evidence:** quota Obs.1 (Student→StudentReturnType cascade across 8+ files)

### Issue: Deferred Items Never Resolved

**Problem:** Tasks defer work to "future task" without logging it. ~40% of deferred items never get resolved, accumulating as silent technical debt.

**Symptoms:**
- TODO comments in code with no tracking
- "Will handle this in Task X" never happens
- Incomplete cache invalidation, missing env-config keys

**Solution:**
- Create `deferred-items.md` ledger at plan start (Phase 0)
- Log ALL deferred items immediately with source/target task
- Final quality gate enforces: `grep -c "❌|⚠️" deferred-items.md` must equal 0

**Evidence:** whatsapp §5.2 (2 of 5 never resolved), quota Obs.8 (~40% never resolved)

### Issue: TOCTOU Race Conditions Pass Quality Loop

**Problem:** Read-then-write sequences (SELECT + UPDATE) pass tsgo+biome+lint but cause credit leaks under concurrency.

**Symptoms:**
- Quality loop reports ✅
- No TypeScript errors
- Race condition discovered during load testing or production incident

**Solution:**
- Add **Semantic Review Checklist** to MANDATORY subtasks
- Check: No read-then-write without atomicity (SELECT FOR UPDATE / tx / advisory lock)
- Require concurrency assessment in design for shared-state features

**Evidence:** whatsapp §3.1 (notification.repository, Redis pair-rate-limit), quota Obs.7 (deductPendingRefresh)

### Issue: i18n String Literals vs Enum Property Access

**Problem:** Plan specifies `useAppTranslation("DashboardFeature")` (string) but convention requires `Translation.Dashboard.FeatureName` (enum property).

**Symptoms:**
- Plan review finds 12+ string-literal i18n references
- Implementation uses wrong pattern, breaks compile-time type safety

**Solution:**
- Add **Requirement 0.5: Translation System Compliance** to requirements template
- Use `t.propertyName` NOT `t('propertyName')`
- Include in Plan Review Gate (Phase 1.5) checks

**Evidence:** quota Obs.12, whatsapp §7.3, auto-meeting-url pattern #4

### Issue: Schema Drift (Migration vs Drizzle)

**Problem:** Column exists in migration SQL but not in Drizzle schema (or vice versa).

**Symptoms:**
- Query fails at runtime: "column does not exist"
- TypeScript compiles cleanly (schema out of sync with DB)

**Solution:**
- Add to Semantic Review Checklist: Schema migrations match Drizzle schema
- Verify every migration column exists in `backend/db/schema/`

**Evidence:** whatsapp §3.5 (max_phone_numbers_per_business in migration but not schema)

### Issue: Drizzle Inline Comment Breaks Parameter Binding

**Problem:** Inline `--` comments inside `sql`` templates shift parameter positions, causing wrong values bound.

**Symptoms:**
- Test fails with unexpected SQL behavior
- Parameters bound to wrong placeholders

**Solution:**
- NEVER use inline `--` comments inside `sql`` templates
- Use block comments outside or omit comments
- Add to design template anti-patterns section

**Evidence:** cron §1 (parameter binding shift from `--` comment in CASE expression)

### Issue: Enum Import Type vs Value Confusion

**Problem:** Enum imported as `import type` but used in runtime cast/conditional, causing "not defined" error at runtime.

**Symptoms:**
- TypeScript compiles cleanly
- Runtime error: "ClassType is not defined"

**Solution:**
- Add to Semantic Review Checklist: Enums used at runtime imported as values (not `import type`)
- Use `import type` ONLY for pure type annotations

**Evidence:** All four implementations (quota, whatsapp, cron, auto-meeting-url) had enum import confusion

### Issue: Cross-Layer Import Violations

**Problem:** Frontend component imports from `@/backend/` or shared imports from `@/frontend/`, violating layer boundaries.

**Symptoms:**
- Quality loop passes (no lint rule catches it initially)
- Post-implementation review finds violations

**Solution:**
- Add to Semantic Review Checklist: No cross-layer imports
- Enforce: frontend → shared ✅, backend → shared ✅, frontend → backend ❌, shared → frontend/backend ❌

**Evidence:** whatsapp §5.5 (DashboardProfileShell importing from @/backend/)

### Issue: Lint Service Migration (HTTP → In-Process API)

**Problem:** Old code uses `curl -X POST http://localhost:${LINT_QUEUE_PORT}/lint`, but lint service consolidated to in-process API.

**Symptoms:**
- Lint queue server not running → lint calls fail
- Plan references stale HTTP endpoints

**Solution:**
- Use `bun run scripts/lint-service.ts -f <file> --id <caller-id>` (CLI)
- Or `import { requestLint } from "@/scripts/lint-service"` (programmatic)
- No HTTP, no server startup required

**Evidence:** Plan `.kilo/plans/1785894852744-consolidate-lint-service.md` (implemented, HTTP removed)

---

[← Back to Execution Guide](README.md) | [Implementation Guide ←](implementation-guide.md) | [Quality Assurance ←](quality-assurance.md)
