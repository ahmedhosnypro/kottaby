/**
 * Teacher-applicant domain services barrel.
 *
 * Per root `AGENTS.md` barrel conventions: relative `./` paths only,
 * `export *` re-exports, parent barrels never reach into nested files
 * directly (DISP-2 registration of the net-new services domain).
 */
export * from "./applicant-lifecycle.service";
