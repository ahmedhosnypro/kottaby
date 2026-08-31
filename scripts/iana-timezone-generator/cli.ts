#!/usr/bin/env bun
/**
 * Generates IANA timezone constants, bilingual path labels, and backend enum
 * from Intl.supportedValuesOf("timeZone") + CLDR Arabic translations.
 * Run: bun run generate:iana-timezones
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildBackendEnumFile,
  buildIanaTimezoneLabels,
  buildIanaTimezoneTerritories,
  buildSharedConstantsFile,
  buildSharedLabelsFile,
  buildSharedTerritoriesFile,
  CLDR_AR_TERRITORIES_PATH,
  CLDR_AR_TIMEZONES_PATH,
  CLDR_WINDOWS_ZONES_PATH,
  SHARED_ENUM_OUTPUT,
  SHARED_IDS_OUTPUT,
  SHARED_LABELS_OUTPUT,
  SHARED_TERRITORIES_OUTPUT,
} from "@/scripts/iana-timezone-generator";
import { isExcludedIanaTimezoneId } from "@/shared/lib/timezone/excluded-iana-timezones";

function getIanaTimezoneIds(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") {
    throw new Error("Intl.supportedValuesOf is not available in this runtime");
  }
  return [...Intl.supportedValuesOf("timeZone")]
    .filter(id => !isExcludedIanaTimezoneId(id))
    .toSorted((a, b) => a.localeCompare(b));
}

async function main(): Promise<void> {
  if (
    !existsSync(CLDR_AR_TIMEZONES_PATH) ||
    !existsSync(CLDR_AR_TERRITORIES_PATH) ||
    !existsSync(CLDR_WINDOWS_ZONES_PATH)
  ) {
    throw new Error("CLDR data not found. Run: bun add -d cldr-core cldr-dates-full cldr-localenames-full");
  }

  const ids = getIanaTimezoneIds();
  const labels = buildIanaTimezoneLabels(ids);
  const territories = buildIanaTimezoneTerritories(ids);

  await mkdir(dirname(SHARED_IDS_OUTPUT), { recursive: true });
  await mkdir(dirname(SHARED_ENUM_OUTPUT), { recursive: true });

  await writeFile(SHARED_IDS_OUTPUT, buildSharedConstantsFile(ids), "utf8");
  await writeFile(SHARED_LABELS_OUTPUT, buildSharedLabelsFile(labels), "utf8");
  await writeFile(SHARED_TERRITORIES_OUTPUT, buildSharedTerritoriesFile(territories), "utf8");
  await writeFile(SHARED_ENUM_OUTPUT, buildBackendEnumFile(ids), "utf8");

  console.log(`Generated ${ids.length} IANA timezones:`);
  console.log(`  ${SHARED_IDS_OUTPUT}`);
  console.log(`  ${SHARED_LABELS_OUTPUT}`);
  console.log(`  ${SHARED_TERRITORIES_OUTPUT}`);
  console.log(`  ${SHARED_ENUM_OUTPUT}`);
}

await main();
