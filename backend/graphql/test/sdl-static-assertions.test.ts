/**
 * Generated-SDL static assertion suite — the notification GraphQL surface
 * pinned over the COMMITTED artifact (`frontend/graphql/generated/schema.graphql`),
 * NOT the in-memory builder output (schema-surface.test.ts owns the built-schema
 * tier plus the artifact↔builder byte-identity proof).
 *
 * Why an artifact-side tier: gateway Rule 8.5 requires schema/codegen artifacts
 * to be committed in the SAME change set as their registrations — this suite
 * fails when the committed SDL drifts from the sanctioned contract even while
 * the Pothos tree itself is momentarily consistent.
 *
 * What this locks down (REQ-032 / REQ-060 / REQ-061 / REQ-069):
 *  - **BFLA verdict (REQ-032)** — the generated SDL contains ZERO
 *    `createNotification` / `updateNotification` / `deleteNotification`
 *    operations: every field on every object AND input type is scanned by
 *    name, and the forbidden tokens must not appear anywhere in the artifact
 *    text. Notification emission is service-internal ONLY — the GraphQL
 *    write surface is exactly the read-latch pair.
 *  - **Root-set freeze** — the Mutation root is EXACTLY the refreshed frozen
 *    7-op baseline (auth quartet + the sanctioned notification read-latch
 *    pair + the sanctioned users-locale mutation) and the Query root is
 *    EXACTLY the frozen baseline + the `_health` probe (mirrors the
 *    `PRE_3_1_*` inventories in schema-surface.test.ts).
 *  - **Users-locale surface (D2)** — `updateMyLocale(locale: AppLocale!): User!`
 *    is present with its EXACT SDL signature, `User.locale` is the nullable
 *    `AppLocale` enum, and the `AppLocale` enum carries exactly the two
 *    canonical values.
 *  - **REQ-060 four-ops contract** — `myNotifications`,
 *    `myUnreadNotificationCount`, `markNotificationRead`,
 *    `markAllNotificationsRead` are present with their EXACT SDL signatures
 *    (argument names/types + return types), and `MyNotificationsFilterInput`
 *    carries exactly the four nullable filter fields.
 *  - **Apollo normalization** — the `Notification` object carries `id: ID!`
 *    among EXACTLY the eight inbox fields.
 *  - **Depth/complexity posture (REQ-069)** — `Notification` is FLAT: every
 *    field references a spec scalar or the `NotificationType` enum (zero
 *    object-typed or list-typed fields); no self-referential or recursive
 *    shape exists; the ONLY object-typed field in the notification family is
 *    the page wrapper's bounded `items: [Notification!]!` list (the 1..50
 *    page cap is enforced at the service boundary — the SDL carries the
 *    bounded window via the filter input, not an unbounded connection); and
 *    NO Subscription root exists — realtime delivery is the WebSocket
 *    sidecar's contract, never a GraphQL subscription.
 *
 * Pure static tier — the SDL text is parsed with `parse()` and walked as an
 * AST: NO schema build, NO DB, NO server boot, NO disk writes. Runs via the
 * mandated runner:
 *   bun run test/scripts/run-test.ts backend/graphql/test/sdl-static-assertions.test.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type EnumTypeDefinitionNode,
  type InputObjectTypeDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  type TypeNode,
} from "graphql";

// ─── Frozen baselines (mirror the refreshed PRE_3_1_* inventories in ─────────
// ─── schema-surface.test.ts — the single sanctioned growth history) ──────────

/** Root mutation fields — the auth quartet + the sanctioned notification read-latch pair + the sanctioned users-locale mutation (D2). */
const FROZEN_MUTATION_FIELDS = [
  "login",
  "logout",
  "markAllNotificationsRead",
  "markNotificationRead",
  "refreshToken",
  "registerUser",
  "updateMyLocale",
] as const;

/** Root query fields — the frozen baseline + the sanctioned inbox reads + the probe. */
const FROZEN_QUERY_FIELDS = [
  "_health",
  "me",
  "myApplicantProfile",
  "myNotifications",
  "myUnreadNotificationCount",
  "recitationReadings",
] as const;

/** REQ-032: emit is service-internal — these operations must NEVER exist. */
const FORBIDDEN_NOTIFICATION_CUD_FIELDS = ["createNotification", "deleteNotification", "updateNotification"] as const;

/** REQ-060: the exact eight-field inbox surface. */
const CANONICAL_NOTIFICATION_FIELDS = [
  "body",
  "createdAt",
  "id",
  "isRead",
  "relatedEntityId",
  "relatedEntityType",
  "title",
  "type",
] as const;

/** Leaf types a FLAT notification field may reference (spec scalars + the enum). */
const SDL_LEAF_TYPE_NAMES = new Set(["Boolean", "ID", "Int", "NotificationType", "String"]);

// ─── Artifact load + AST walk helpers (read-only; no schema build) ────────────

const SDL_PATH = resolve(process.cwd(), "frontend/graphql/generated/schema.graphql");
const sdlText = readFileSync(SDL_PATH, "utf8");
const sdlDocument = parse(sdlText);

/** Renders a type node back to SDL notation (`ID!`, `[Notification!]!`, …). */
function renderType(node: TypeNode): string {
  switch (node.kind) {
    case Kind.NAMED_TYPE:
      return node.name.value;
    case Kind.LIST_TYPE:
      return `[${renderType(node.type)}]`;
    case Kind.NON_NULL_TYPE:
      return `${renderType(node.type)}!`;
    default:
      throw new Error("unexpected type node kind in the generated SDL");
  }
}

/** Unwraps `[…]`/`!` wrappers to the bare named type. */
function namedTypeName(node: TypeNode): string {
  return node.kind === Kind.NAMED_TYPE ? node.name.value : namedTypeName(node.type);
}

/** Field surface descriptor: name, rendered argument signatures, rendered + named type. */
interface FieldSurface {
  readonly name: string;
  readonly args: ReadonlyArray<{ readonly name: string; readonly type: string }>;
  readonly type: string;
  readonly namedType: string;
}

/** Locates one object type definition in the artifact (fail-fast when missing). */
function objectTypeDefinition(name: string): ObjectTypeDefinitionNode {
  const found = sdlDocument.definitions.find(
    (definition): definition is ObjectTypeDefinitionNode =>
      definition.kind === Kind.OBJECT_TYPE_DEFINITION && definition.name.value === name
  );
  if (!found) {
    throw new Error(`Generated SDL must define the \`${name}\` object type`);
  }
  return found;
}

/** Locates one input object type definition in the artifact (fail-fast when missing). */
function inputObjectTypeDefinition(name: string): InputObjectTypeDefinitionNode {
  const found = sdlDocument.definitions.find(
    (definition): definition is InputObjectTypeDefinitionNode =>
      definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && definition.name.value === name
  );
  if (!found) {
    throw new Error(`Generated SDL must define the \`${name}\` input type`);
  }
  return found;
}

/** Field surfaces of one object type, in artifact definition order. */
function fieldSurfaces(typeName: string): FieldSurface[] {
  return (objectTypeDefinition(typeName).fields ?? []).map(field => ({
    name: field.name.value,
    args: (field.arguments ?? []).map(argument => ({
      name: argument.name.value,
      type: renderType(argument.type),
    })),
    type: renderType(field.type),
    namedType: namedTypeName(field.type),
  }));
}

/** Locates one field surface on one object type (fail-fast when missing). */
function fieldSurface(typeName: string, fieldName: string): FieldSurface {
  const found = fieldSurfaces(typeName).find(surface => surface.name === fieldName);
  if (!found) {
    throw new Error(`\`${typeName}\` must expose the \`${fieldName}\` field`);
  }
  return found;
}

/** Every field name defined on ANY object or input type in the artifact. */
function allFieldNames(): string[] {
  const names: string[] = [];
  for (const definition of sdlDocument.definitions) {
    if (definition.kind === Kind.OBJECT_TYPE_DEFINITION || definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      for (const field of definition.fields ?? []) {
        names.push(field.name.value);
      }
    }
  }
  return names;
}

/** All object type names defined in the artifact (the node-typed reference set). */
function objectTypeNameSet(): Set<string> {
  return new Set(
    sdlDocument.definitions
      .filter((definition): definition is ObjectTypeDefinitionNode => definition.kind === Kind.OBJECT_TYPE_DEFINITION)
      .map(definition => definition.name.value)
  );
}

describe("BFLA structural verdict — zero notification CUD surface (REQ-032)", () => {
  test("ZERO createNotification/updateNotification/deleteNotification field definitions on ANY type", () => {
    const names = allFieldNames();
    for (const forbidden of FORBIDDEN_NOTIFICATION_CUD_FIELDS) {
      expect(names).not.toContain(forbidden);
    }
  });

  test("the CUD tokens appear NOWHERE in the artifact text (lexical belt-and-braces)", () => {
    for (const forbidden of FORBIDDEN_NOTIFICATION_CUD_FIELDS) {
      expect(sdlText).not.toContain(forbidden);
    }
  });

  test("Mutation root is EXACTLY the refreshed frozen 7-op baseline — the notification write surface is the read-latch pair only", () => {
    const names = fieldSurfaces("Mutation").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...FROZEN_MUTATION_FIELDS]);
  });

  test("Query root is EXACTLY the frozen baseline + the `_health` probe (zero unsanctioned growth)", () => {
    const names = fieldSurfaces("Query").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...FROZEN_QUERY_FIELDS]);
  });
});

describe("REQ-060 four-ops contract — exact SDL signatures on the artifact", () => {
  test("`myNotifications(filter: MyNotificationsFilterInput): NotificationListPage!`", () => {
    const surface = fieldSurface("Query", "myNotifications");
    expect(surface.type).toBe("NotificationListPage!");
    expect(surface.args).toEqual([{ name: "filter", type: "MyNotificationsFilterInput" }]);
  });

  test("`myUnreadNotificationCount: Int!` — zero arguments", () => {
    const surface = fieldSurface("Query", "myUnreadNotificationCount");
    expect(surface.type).toBe("Int!");
    expect(surface.args).toEqual([]);
  });

  test("`markNotificationRead(id: ID!): Notification!`", () => {
    const surface = fieldSurface("Mutation", "markNotificationRead");
    expect(surface.type).toBe("Notification!");
    expect(surface.args).toEqual([{ name: "id", type: "ID!" }]);
  });

  test("`markAllNotificationsRead(type: NotificationType): Int!`", () => {
    const surface = fieldSurface("Mutation", "markAllNotificationsRead");
    expect(surface.type).toBe("Int!");
    expect(surface.args).toEqual([{ name: "type", type: "NotificationType" }]);
  });

  test("`updateMyLocale(locale: AppLocale!): User!` — the D2 users-locale signature", () => {
    const surface = fieldSurface("Mutation", "updateMyLocale");
    expect(surface.type).toBe("User!");
    expect(surface.args).toEqual([{ name: "locale", type: "AppLocale!" }]);
  });

  test("MyNotificationsFilterInput carries EXACTLY the four REQ-060 filter fields, all nullable", () => {
    const fields = inputObjectTypeDefinition("MyNotificationsFilterInput").fields ?? [];
    expect(fields.map(field => field.name.value).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "isRead",
      "limit",
      "offset",
      "type",
    ]);
    const byName = new Map(fields.map(field => [field.name.value, renderType(field.type)]));
    expect(byName.get("type")).toBe("NotificationType");
    expect(byName.get("isRead")).toBe("Boolean");
    expect(byName.get("limit")).toBe("Int");
    expect(byName.get("offset")).toBe("Int");
  });
});

describe("Notification object — `id` + REQ-069 depth/complexity posture", () => {
  test("carries `id: ID!` among EXACTLY the eight REQ-060 inbox fields (Apollo normalization)", () => {
    const names = fieldSurfaces("Notification").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...CANONICAL_NOTIFICATION_FIELDS]);
    expect(fieldSurface("Notification", "id").type).toBe("ID!");
  });

  test("is FLAT — every field references a spec scalar or the NotificationType enum (zero object/list-typed fields)", () => {
    for (const surface of fieldSurfaces("Notification")) {
      expect(SDL_LEAF_TYPE_NAMES.has(surface.namedType)).toBe(true);
    }
  });

  test("has NO self-referential or recursive shape — no field references Notification or NotificationListPage", () => {
    for (const surface of fieldSurfaces("Notification")) {
      expect(surface.namedType).not.toBe("Notification");
      expect(surface.namedType).not.toBe("NotificationListPage");
    }
  });

  test("the ONLY object-typed field in the notification family is the page wrapper's bounded `items` list", () => {
    const objectTypes = objectTypeNameSet();
    const family = [
      ...fieldSurfaces("Notification").map(surface => ({ owner: "Notification", surface })),
      ...fieldSurfaces("NotificationListPage").map(surface => ({ owner: "NotificationListPage", surface })),
    ];
    const objectTyped = family
      .filter(entry => objectTypes.has(entry.surface.namedType))
      .map(entry => `${entry.owner}.${entry.surface.name}: ${entry.surface.type}`);
    expect(objectTyped).toEqual(["NotificationListPage.items: [Notification!]!"]);
  });

  test("NotificationListPage exposes EXACTLY the bounded wrapper contract (items/totalCount/hasMore, no id)", () => {
    const surfaces = fieldSurfaces("NotificationListPage");
    expect(surfaces.map(surface => surface.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "hasMore",
      "items",
      "totalCount",
    ]);
    expect(fieldSurface("NotificationListPage", "items").type).toBe("[Notification!]!");
    expect(fieldSurface("NotificationListPage", "totalCount").type).toBe("Int!");
    expect(fieldSurface("NotificationListPage", "hasMore").type).toBe("Boolean!");
    // Embedded wrapper — the normalizable entities are the rows inside `items`.
    expect(surfaces.some(surface => surface.name === "id")).toBe(false);
  });

  test("NO Subscription root exists — realtime delivery is the WebSocket sidecar's contract, never a GraphQL subscription", () => {
    const hasSubscriptionRoot = sdlDocument.definitions.some(
      definition => definition.kind === Kind.OBJECT_TYPE_DEFINITION && definition.name.value === "Subscription"
    );
    expect(hasSubscriptionRoot).toBe(false);
    expect(sdlText).not.toContain("Subscription");
  });
});

describe("Users-locale surface (D2) — AppLocale enum + User.locale on the artifact", () => {
  test("AppLocale enum carries EXACTLY the two canonical values (Ar, En)", () => {
    const appLocaleEnum = sdlDocument.definitions.find(
      (definition): definition is EnumTypeDefinitionNode =>
        definition.kind === Kind.ENUM_TYPE_DEFINITION && definition.name.value === "AppLocale"
    );
    if (!appLocaleEnum) {
      throw new Error("Generated SDL must define the `AppLocale` enum type");
    }
    const values = (appLocaleEnum.values ?? []).map(value => value.name.value).toSorted((a, b) => a.localeCompare(b));
    expect(values).toEqual(["Ar", "En"]);
  });

  test("`User.locale` is the NULLABLE AppLocale enum on the artifact", () => {
    const surface = fieldSurface("User", "locale");
    expect(surface.type).toBe("AppLocale");
    expect(surface.args).toEqual([]);
  });
});
