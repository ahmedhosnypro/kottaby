import { restoreCanonicalNextEnvDts } from "@/scripts/lib";

const restored = await restoreCanonicalNextEnvDts();
if (restored) {
  process.stdout.write("Restored next-env.d.ts to canonical dev dist dir (.next-dev).\n");
}
