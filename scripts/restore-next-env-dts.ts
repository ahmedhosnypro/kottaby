import { restoreCanonicalNextEnvDts } from "@/scripts/lib/restore-next-env-dts";

const restored = await restoreCanonicalNextEnvDts();
if (restored) {
  process.stdout.write("Restored next-env.d.ts to canonical dev dist dir (.next-dev).\n");
}
