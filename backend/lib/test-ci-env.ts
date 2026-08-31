/**
 * Detect whether the current process is running in CI / test CI mode.
 */
export function isTestCi(): boolean {
  return process.env.TEST_CI === "true" || process.env.CI === "true";
}
