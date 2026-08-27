import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Dist dir used by local dev scripts (`package.json` `dev` / `debug`). */
export const DEV_NEXT_DIST_DIR = ".next-dev";

const NEXT_ENV_DTS_FILE = "next-env.d.ts";

function detectEol(content: string | undefined): string {
  if (!content) {
    return "\n";
  }

  const lf = content.indexOf("\n", 1);
  if (lf !== -1 && content[lf - 1] === "\r") {
    return "\r\n";
  }

  return "\n";
}

export function getCanonicalNextEnvDtsContent(eol = "\n"): string {
  const lines = [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    `import "./${DEV_NEXT_DIST_DIR}/types/routes.d.ts";`,
    "",
    "// NOTE: This file should not be edited",
    "// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.",
  ];

  return lines.join(eol) + eol;
}

/**
 * Rewrites `next-env.d.ts` to always reference the dev dist dir.
 *
 * Next.js regenerates this file on every `next dev` / `next build` / `next typegen`
 * using the active `NEXT_DIST_DIR`. Test servers use per-port dirs (`.next-test-*`),
 * which would otherwise point type-checking at stale build artifacts.
 */
export async function restoreCanonicalNextEnvDts(rootDir = process.cwd()): Promise<boolean> {
  const filePath = join(rootDir, NEXT_ENV_DTS_FILE);
  let currentContent: string | undefined;

  try {
    currentContent = await readFile(filePath, "utf8");
  } catch {
    // File may not exist yet on a fresh clone before the first dev run.
  }

  const content = getCanonicalNextEnvDtsContent(detectEol(currentContent));
  if (currentContent === content) {
    return false;
  }

  await writeFile(filePath, content, "utf8");
  return true;
}
