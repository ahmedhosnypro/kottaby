import { seedOrGetPlans } from "@/backend/db/seeds/billing";
import {
  loadSeedConfig,
  logFailedSeedSteps,
  runSeedStep,
  type SeedConfig,
  type SeedStepResult,
} from "@/backend/db/seeds/lib";
import { seedOrGetStudents } from "@/backend/db/seeds/students";
import { seedOrGetUsers } from "@/backend/db/seeds/users";
import { logger } from "@/backend/lib/logger";

export async function runAllSeeds(config?: SeedConfig): Promise<void> {
  const seedConfig = config ?? loadSeedConfig();
  logger.info(`Starting database seeding (profile: ${seedConfig.profile})...`);

  const stepResults: SeedStepResult[] = [];

  // Step 1: Users (Admin, Teacher Applicant, Parent, Student)
  const usersStep = await runSeedStep("users", () => seedOrGetUsers(seedConfig));
  stepResults.push(usersStep);

  // Step 2: Plans (Catalog plans + verification plan + deactivated demo plan)
  const plansStep = await runSeedStep("plans", () => seedOrGetPlans("en"));
  stepResults.push(plansStep);

  // Step 3: Demo student trial-grant reconcile. Receives the users-step result
  // so the created demo student(s) are passed through explicitly; the seeder
  // falls back to the shared demo-user specs for rows that already existed
  // (the users-step result only contains newly created users) and applies the
  // production grant entry point only to rows whose trial marker is still null.
  const studentsStep = await runSeedStep("students", () => seedOrGetStudents(usersStep.value ?? []));
  stepResults.push(studentsStep);

  logFailedSeedSteps(stepResults);

  const failedCount = stepResults.filter(s => !s.ok).length;
  if (failedCount > 0) {
    throw new Error(`Seeding finished with ${failedCount} failed step(s).`);
  }

  logger.info("All seed steps executed successfully.");
}
