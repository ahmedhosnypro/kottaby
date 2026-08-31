export type SeedProfile = "minimal" | "standard";

export interface SeedConfig {
  profile: SeedProfile;
  anchorDate: Date;
  defaultAdminCredential: string;
}

function parseSeedProfile(): SeedProfile {
  const raw = process.env.SEED_PROFILE?.toLowerCase();
  if (raw === "minimal" || raw === "standard") {
    return raw;
  }
  return "standard";
}

function parseAnchorDate(): Date {
  const raw = process.env.SEED_ANCHOR_DATE;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

/** Fallback credential used when `ADMIN_PASSWORD` is unset (local dev only). */
const FALLBACK_ADMIN_CREDENTIAL = "Seed_Pass1!";

export function loadSeedConfig(): SeedConfig {
  const profile = parseSeedProfile();
  const defaultAdminCredential = process.env.ADMIN_PASSWORD ?? FALLBACK_ADMIN_CREDENTIAL;

  return {
    profile,
    anchorDate: parseAnchorDate(),
    defaultAdminCredential,
  };
}
