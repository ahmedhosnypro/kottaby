import { loadSeedConfig, type SeedConfig } from "@/backend/db/seeds/lib";
import { Gender } from "@/backend/enum/users/gender.enum";
import { logger } from "@/backend/lib/logger";
import { RegistrationService } from "@/backend/services";
import type { RegistrationReturnType } from "@/backend/types";

export interface DemoUserSpec {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  role: "admin" | "teacher" | "student" | "parent";
  gender?: Gender;
}

export const INITIAL_DEMO_USERS: DemoUserSpec[] = [
  {
    fullName: "Super Admin",
    email: process.env.ADMIN_EMAIL ?? "admin@draftacademy.local",
    phone: "+201000000001",
    country: "Egypt",
    role: "admin",
    gender: Gender.Male,
  },
  {
    fullName: "Demo Teacher",
    email: "teacher@draftacademy.local",
    phone: "+201000000002",
    country: "Egypt",
    role: "teacher",
    gender: Gender.Male,
  },
  {
    fullName: "Demo Parent",
    email: "parent@draftacademy.local",
    phone: "+201000000003",
    country: "Egypt",
    role: "parent",
    gender: Gender.Male,
  },
  {
    fullName: "Demo Student",
    email: "student@draftacademy.local",
    phone: "+201000000004",
    country: "Egypt",
    role: "student",
    gender: Gender.Male,
  },
];

export async function seedOrGet(config?: SeedConfig): Promise<RegistrationReturnType[]> {
  logger.info("Seeding demo users via RegistrationService...");
  const seedConfig = config ?? loadSeedConfig();
  const password = seedConfig.defaultAdminCredential;
  const locale = "en";

  const results: RegistrationReturnType[] = [];

  await INITIAL_DEMO_USERS.reduce<Promise<void>>(async (previous, userSpec) => {
    await previous;
    try {
      if (userSpec.role === "admin") {
        const user = await RegistrationService.createAdminUser(
          {
            fullName: userSpec.fullName,
            email: userSpec.email,
            phone: userSpec.phone,
            country: userSpec.country,
            password,
            gender: userSpec.gender,
            role: "admin",
          },
          locale
        );
        results.push(user);
        logger.info(`Seeded admin user: ${user.email}`);
      } else {
        const user = await RegistrationService.registerUser(
          {
            fullName: userSpec.fullName,
            email: userSpec.email,
            phone: userSpec.phone,
            country: userSpec.country,
            password,
            gender: userSpec.gender,
            role: userSpec.role,
          },
          locale
        );
        results.push(user);
        logger.info(`Seeded ${userSpec.role} user: ${user.email}`);
      }
    } catch (err) {
      // If already registered / conflict, look up or skip gracefully
      const isConflict =
        err instanceof Error &&
        (err.name === "ConflictError" || err.message.includes("already exists") || err.message.includes("23505"));

      if (isConflict) {
        logger.info(`User already exists, skipping: ${userSpec.email}`);
      } else {
        logger.error(`Failed to seed user ${userSpec.email}:`, err);
        throw err;
      }
    }
  }, Promise.resolve());

  logger.info(`Demo users seeding completed (${results.length} newly created).`);
  return results;
}
