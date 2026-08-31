import { spawnSync } from "bun";
import { getTestProductionEnv, restoreCanonicalNextEnvDts } from "@/scripts/lib";

const result = spawnSync(["bun", "run", "next", "build", "--experimental-build-mode", "compile"], {
  env: getTestProductionEnv(),
  stdio: ["inherit", "inherit", "inherit"],
});

await restoreCanonicalNextEnvDts();

process.exit(result.exitCode ?? 1);
