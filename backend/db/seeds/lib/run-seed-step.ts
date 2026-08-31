import { logger } from "@/backend/lib/logger";

export type SeedStepResult = {
  name: string;
  ok: boolean;
  error?: unknown;
};

export type SeedStepOutcome<T> = SeedStepResult & {
  value?: T;
};

export async function runSeedStep<T>(name: string, fn: () => Promise<T>): Promise<SeedStepOutcome<T>> {
  try {
    const value = await fn();
    return { name, ok: true, value };
  } catch (error) {
    logger.error(`Seed step failed: ${name}`, error);
    return { name, ok: false, error };
  }
}

export function logFailedSeedSteps(results: readonly SeedStepResult[]): void {
  const failed = results.filter(result => !result.ok);
  if (failed.length === 0) return;

  logger.error(`Seed run completed with ${failed.length} failed step(s): ${failed.map(step => step.name).join(", ")}`);
}
