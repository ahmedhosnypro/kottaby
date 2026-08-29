import { spawnSync } from "bun";
import { restoreCanonicalNextEnvDts } from "@/scripts/lib/restore-next-env-dts";
import { getTestProductionEnv } from "@/scripts/lib/test-build-env";

const result = spawnSync(["bun", "run", "next", "build", "--experimental-build-mode", "compile"], {
  env: getTestProductionEnv(),
  stdio: ["inherit", "inherit", "inherit"],
});

await restoreCanonicalNextEnvDts();

process.exit(result.exitCode ?? 1);
