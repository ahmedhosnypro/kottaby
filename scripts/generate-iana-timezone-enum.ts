#!/usr/bin/env bun
/**
 * Generates IANA timezone constants, bilingual path labels, and backend enum
 * from Intl.supportedValuesOf("timeZone") + CLDR Arabic translations.
 * Run: bun run generate:iana-timezones
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isExcludedIanaTimezoneId } from "@/shared/lib/timezone/excluded-iana-timezones";

const ROOT = join(import.meta.dir, "..");
const SHARED_IDS_OUTPUT = join(ROOT, "shared/constants/iana-timezones.ts");
const SHARED_LABELS_OUTPUT = join(ROOT, "shared/constants/iana-timezone-labels.ts");
const SHARED_TERRITORIES_OUTPUT = join(ROOT, "shared/constants/iana-timezone-territories.ts");
const SHARED_ENUM_OUTPUT = join(ROOT, "shared/constants/iana-timezone.enum.ts");

const CLDR_AR_TIMEZONES_PATH = join(ROOT, "node_modules/cldr-dates-full/main/ar/timeZoneNames.json");
const CLDR_AR_TERRITORIES_PATH = join(ROOT, "node_modules/cldr-localenames-full/main/ar/territories.json");
const CLDR_WINDOWS_ZONES_PATH = join(ROOT, "node_modules/cldr-core/supplemental/windowsZones.json");

const REGION_LABELS_AR: Record<string, string> = {
  Africa: "أفريقيا",
  America: "أمريكا",
  Antarctica: "أنتاركتيكا",
  Arctic: "القطب الشمالي",
  Asia: "آسيا",
  Atlantic: "الأطلسي",
  Australia: "أستراليا",
  Europe: "أوروبا",
  Indian: "المحيط الهندي",
  Pacific: "المحيط الهادئ",
  Etc: "إلخ",
  UTC: "UTC",
};

/** CLDR uses legacy city keys for some renamed IANA zones. */
const CITY_ALIASES: Record<string, string> = {
  Asmara: "Asmera",
  Nuuk: "Godthab",
  Ho_Chi_Minh: "Saigon",
  Kolkata: "Calcutta",
  Kathmandu: "Katmandu",
  Yangon: "Rangoon",
  Kyiv: "Kiev",
  Chuuk: "Truk",
  Pohnpei: "Ponape",
  Kanton: "Enderbury",
  Faroe: "Faeroe",
  Choibalsan: "Ulaanbaatar",
};

/** IANA path segments mapped to CLDR territory codes for Arabic subdivision labels. */
const SEGMENT_TERRITORY: Record<string, string> = {
  Argentina: "AR",
};

/** Static Arabic labels for path segments without CLDR exemplarCity entries. */
const SEGMENT_STATIC_AR: Record<string, string> = {
  Indiana: "إنديانا",
  Kentucky: "كنتاكي",
  North_Dakota: "داكوتا الشمالية",
  Atikokan: "أتيكوكان",
};

type CldrZoneNode = {
  readonly exemplarCity?: string;
  readonly short?: { readonly standard?: string };
  readonly long?: { readonly standard?: string };
};

type CldrZoneTree = Record<string, unknown>;

type IanaTimezoneLabels = {
  readonly en: string;
  readonly ar: string;
};

type CldrZoneTreeData = {
  readonly main: { readonly ar: { readonly dates: { readonly timeZoneNames: { readonly zone: CldrZoneTree } } } };
};

type CldrTerritoriesData = {
  readonly main: {
    readonly ar: { readonly localeDisplayNames: { readonly territories: Record<string, string> } };
  };
};

type CldrWindowsZonesData = {
  readonly supplemental: {
    readonly windowsZones: {
      readonly mapTimezones: ReadonlyArray<{
        readonly mapZone: { readonly _type: string; readonly _territory: string };
      }>;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v): v is string => typeof v === "string");
}

function isCldrZoneNode(value: unknown): value is CldrZoneNode {
  if (!isRecord(value)) return false;
  if (value.exemplarCity !== undefined && typeof value.exemplarCity !== "string") return false;
  return true;
}

function isCldrZoneTreeData(data: unknown): data is CldrZoneTreeData {
  if (!isRecord(data)) return false;
  const mainData = data.main;
  if (!isRecord(mainData)) return false;
  const ar = mainData.ar;
  if (!isRecord(ar)) return false;
  const dates = ar.dates;
  if (!isRecord(dates)) return false;
  const timeZoneNames = dates.timeZoneNames;
  if (!isRecord(timeZoneNames)) return false;
  return isRecord(timeZoneNames.zone);
}

function isCldrTerritoriesData(data: unknown): data is CldrTerritoriesData {
  if (!isRecord(data)) return false;
  const mainData = data.main;
  if (!isRecord(mainData)) return false;
  const ar = mainData.ar;
  if (!isRecord(ar)) return false;
  const localeDisplayNames = ar.localeDisplayNames;
  if (!isRecord(localeDisplayNames)) return false;
  return isStringRecord(localeDisplayNames.territories);
}

function isCldrWindowsZonesData(data: unknown): data is CldrWindowsZonesData {
  if (!isRecord(data)) return false;
  const supplemental = data.supplemental;
  if (!isRecord(supplemental)) return false;
  const windowsZones = supplemental.windowsZones;
  if (!isRecord(windowsZones)) return false;
  const mapTimezones = windowsZones.mapTimezones;
  if (!Array.isArray(mapTimezones)) return false;
  return mapTimezones.every(entry => {
    if (!isRecord(entry)) return false;
    const mapZone = entry.mapZone;
    if (!isRecord(mapZone)) return false;
    const { _type, _territory } = mapZone;
    return typeof _type === "string" && typeof _territory === "string";
  });
}

function ianaIdToEnumKey(ianaId: string): string {
  return ianaId.replace(/\//g, "_").replace(/-/g, "_").replace(/\+/g, "_plus_");
}

function getIanaTimezoneIds(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") {
    throw new Error("Intl.supportedValuesOf is not available in this runtime");
  }
  return [...Intl.supportedValuesOf("timeZone")]
    .filter(id => !isExcludedIanaTimezoneId(id))
    .toSorted((a, b) => a.localeCompare(b));
}

function loadCldrZoneTree(): CldrZoneTree {
  const parsed: unknown = JSON.parse(readFileSync(CLDR_AR_TIMEZONES_PATH, "utf8"));
  if (!isCldrZoneTreeData(parsed)) {
    throw new Error("Invalid CLDR timezone names data structure");
  }
  return parsed.main.ar.dates.timeZoneNames.zone;
}

function loadCldrTerritories(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(CLDR_AR_TERRITORIES_PATH, "utf8"));
  if (!isCldrTerritoriesData(parsed)) {
    throw new Error("Invalid CLDR territories data structure");
  }
  return parsed.main.ar.localeDisplayNames.territories;
}

function walkCldrPath(root: CldrZoneTree, segments: readonly string[]): CldrZoneNode | null {
  let node: unknown = root;
  for (const segment of segments) {
    if (!isRecord(node) || !(segment in node)) {
      return null;
    }
    node = node[segment];
  }
  return isCldrZoneNode(node) ? node : null;
}

function humanizeSegment(segment: string): string {
  return segment.replace(/_/g, " ");
}

function resolveSegmentLabel(
  segment: string,
  isLast: boolean,
  region: string,
  cldrZones: CldrZoneTree,
  territories: Record<string, string>
): string {
  if (SEGMENT_STATIC_AR[segment]) {
    return SEGMENT_STATIC_AR[segment];
  }

  const territoryCode = SEGMENT_TERRITORY[segment];
  if (territoryCode && territories[territoryCode]) {
    return territories[territoryCode];
  }

  if (isLast) {
    const alias = CITY_ALIASES[segment] ?? segment;
    const flatNode = walkCldrPath(cldrZones, [region, alias]);
    if (flatNode?.exemplarCity) {
      return flatNode.exemplarCity;
    }
  }

  return humanizeSegment(segment);
}

function buildArabicPathLabel(ianaId: string, cldrZones: CldrZoneTree, territories: Record<string, string>): string {
  if (ianaId === "UTC") {
    const utcNode = walkCldrPath(cldrZones, ["Etc", "UTC"]);
    return utcNode?.short?.standard ?? "UTC";
  }

  const segments = ianaId.split("/");
  const region = segments[0];
  const regionAr = REGION_LABELS_AR[region] ?? region;

  if (segments.length === 1) {
    return regionAr;
  }

  const locationSegments = segments.slice(1);
  const arLocationParts: string[] = [];

  for (let index = 0; index < locationSegments.length; index++) {
    const segment = locationSegments[index];
    const pathToHere = [region, ...locationSegments.slice(0, index + 1)];
    const node = walkCldrPath(cldrZones, pathToHere);

    if (node?.exemplarCity) {
      arLocationParts.push(node.exemplarCity);
      continue;
    }

    if (index === locationSegments.length - 1) {
      const alias = CITY_ALIASES[segment] ?? segment;
      const flatNode = walkCldrPath(cldrZones, [region, alias]);
      if (flatNode?.exemplarCity) {
        arLocationParts.push(flatNode.exemplarCity);
        continue;
      }
    }

    arLocationParts.push(
      resolveSegmentLabel(segment, index === locationSegments.length - 1, region, cldrZones, territories)
    );
  }

  return [regionAr, ...arLocationParts].join("/");
}

function buildIanaTimezoneLabels(ids: string[]): Record<string, IanaTimezoneLabels> {
  const cldrZones = loadCldrZoneTree();
  const territories = loadCldrTerritories();
  const labels: Record<string, IanaTimezoneLabels> = {};

  for (const id of ids) {
    labels[id] = {
      en: id,
      ar: buildArabicPathLabel(id, cldrZones, territories),
    };
  }

  return labels;
}

/** Manual ISO 3166-1 alpha-2 overrides for zones missing from CLDR windowsZones. */
const EXCLUDED_TERRITORY_CODES = new Set(["IL"]);

const TERRITORY_OVERRIDES: Record<string, string | null> = {
  "Africa/Asmara": "ER",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Argentina/Catamarca": "AR",
  "America/Argentina/Cordoba": "AR",
  "America/Argentina/Jujuy": "AR",
  "America/Argentina/Mendoza": "AR",
  "America/Atikokan": "CA",
  "America/Indiana/Indianapolis": "US",
  "America/Kentucky/Louisville": "US",
  "America/Nuuk": "GL",
  "Antarctica/Troll": "AQ",
  "Asia/Choibalsan": "MN",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Kathmandu": "NP",
  "Asia/Kolkata": "IN",
  "Asia/Yangon": "MM",
  "Atlantic/Faroe": "FO",
  "Europe/Kyiv": "UA",
  "Pacific/Chuuk": "FM",
  "Pacific/Kanton": "KI",
  "Pacific/Pohnpei": "FM",
  UTC: null,
};

function loadCldrTimezoneTerritories(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(CLDR_WINDOWS_ZONES_PATH, "utf8"));
  if (!isCldrWindowsZonesData(parsed)) {
    throw new Error("Invalid CLDR windows zones data structure");
  }
  const territories: Record<string, string> = {};
  for (const entry of parsed.supplemental.windowsZones.mapTimezones) {
    const { _type, _territory } = entry.mapZone;
    if (_territory === "001" || _territory === "ZZ") {
      continue;
    }
    for (const timezoneId of _type.split(" ")) {
      if (!territories[timezoneId]) {
        territories[timezoneId] = _territory;
      }
    }
  }
  return territories;
}

function buildIanaTimezoneTerritories(ids: string[]): Record<string, string | null> {
  const cldrTerritories = loadCldrTimezoneTerritories();
  const territories: Record<string, string | null> = {};
  for (const id of ids) {
    if (id in TERRITORY_OVERRIDES) {
      territories[id] = TERRITORY_OVERRIDES[id];
      continue;
    }
    if (id.startsWith("Etc/GMT")) {
      territories[id] = null;
      continue;
    }
    const territoryCode = cldrTerritories[id] ?? null;
    territories[id] = territoryCode && EXCLUDED_TERRITORY_CODES.has(territoryCode) ? "PS" : territoryCode;
  }
  return territories;
}

function buildSharedTerritoriesFile(territories: Record<string, string | null>): string {
  const entries = Object.entries(territories)
    .map(([id, code]) => `  "${id}": ${code === null ? "null" : JSON.stringify(code)},`)
    .join("\n");
  return `// AUTO-GENERATED by scripts/generate-iana-timezone-enum.ts — do not edit manually
// Regenerate: bun run generate:iana-timezones

import type { IanaTimezoneId } from "@/shared/constants/iana-timezones";

export const IANA_TIMEZONE_TERRITORY_CODES: Record<IanaTimezoneId, string | null> = {
${entries}
};
`;
}

function buildSharedConstantsFile(ids: string[]): string {
  const lines = ids.map(id => `  "${id}",`).join("\n");
  return `// AUTO-GENERATED by scripts/generate-iana-timezone-enum.ts — do not edit manually
// Regenerate: bun run generate:iana-timezones

export const IANA_TIMEZONE_IDS = [
${lines}
] as const;

export type IanaTimezoneId = (typeof IANA_TIMEZONE_IDS)[number];
`;
}

function buildSharedLabelsFile(labels: Record<string, IanaTimezoneLabels>): string {
  const entries = Object.entries(labels)
    .map(([id, value]) => `  "${id}": { en: ${JSON.stringify(value.en)}, ar: ${JSON.stringify(value.ar)} },`)
    .join("\n");

  return `// AUTO-GENERATED by scripts/generate-iana-timezone-enum.ts — do not edit manually
// Regenerate: bun run generate:iana-timezones

import type { IanaTimezoneId } from "@/shared/constants/iana-timezones";

export type IanaTimezoneLabels = {
  readonly en: string;
  readonly ar: string;
};

export const IANA_TIMEZONE_LABELS: Record<IanaTimezoneId, IanaTimezoneLabels> = {
${entries}
};
`;
}

function buildBackendEnumFile(ids: string[]): string {
  const entries = ids
    .map(id => {
      const key = ianaIdToEnumKey(id);
      return `  ${key} = "${id}",`;
    })
    .join("\n");

  return `// AUTO-GENERATED by scripts/generate-iana-timezone-enum.ts — do not edit manually
// Regenerate: bun run generate:iana-timezones

export enum IanaTimezone {
${entries}
}
`;
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
