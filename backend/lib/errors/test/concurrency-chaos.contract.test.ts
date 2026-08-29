/**
 * Concurrency & chaos contract tests over the shared error-handling producers
 * (`finalizeGraphqlErrors`, `apiErrorResponse`, `redactLogContext`,
 * `resolveRequestId`, taxonomy lookups). Zero DB / zero server boot — runs
 * via `bun run test/scripts/run-test.ts
 * backend/lib/errors/test/concurrency-chaos.contract.test.ts`.
 *
 * Coverage map:
 *  - Tier 1 — high-frequency parallel invocation purity: allSettled storms
 *    (N rounds × M way) over a six-class adversarial mix; parallel output is
 *    BYTE-EQUAL to the sequential twin and to every other round; zero
 *    shared-state drift proven by post-storm pristine replay plus frozen
 *    taxonomy lookups; caller inputs never mutated. The
 *    declared logging channel stays exactly-once per masked element under
 *    full interleaving.
 *  - Tier 2 — adversarial throwables matrix: cyclic cause graphs
 *    (self-referential node, tangled pair, three-ring, ring whose tail hides
 *    a UNIQUE marker) terminate deterministically within budget;
 *    throwing-getter traps on guarded carrier channels survive
 *    classification; huge-path arrays cross the finalizer verbatim while the
 *    redactor's bounded slice caps them; fresh-get proxies, self-cycles and
 *    virtual million-length arrays cross redaction WITHOUT unbounded
 *    recursion; a non-Error rejection zoo (functions/classes/generator
 *    objects/symbols/bigints/function-proxies) lands as well-formed masked
 *    envelopes on BOTH surfaces.
 *  - Tier 3 — `resolveRequestId` hostile-header battery + generation storm:
 *    multi-value smuggles, oversized values, control characters, non-string
 *    returns; honored values stay deterministic; generated ids stay valid,
 *    distinct across a 400-way burst (single-resolution path).
 *
 * Harness exclusions: only channels the modules themselves GUARD are probed
 * with hostile payloads — wire items reaching the boundary are Apollo-authored
 * plain records and header readers are fetch `Headers` per the published
 * `RequestHeaderReader` contract, so unguarded-channel traps sit outside both
 * the modules' promises and this corpus.
 *
 * Storage-bound concurrency concerns (idempotency replay bursts through the
 * live idempotency service, 5xx key-release retry semantics, transaction
 * rollback preservation) need DB-backed services and are intentionally ABSENT
 * here. The error-path purity half IS proven: these suites import no DB
 * surface at all, and Tier 1/Tier 2 pin deterministic replay across barrages
 * (no writes emitted from translation/masking utilities).
 */

import { describe, expect, jest, test } from "bun:test";
import { apiErrorResponse, REQUEST_ID_MAX_LENGTH, resolveRequestId } from "@/backend/lib/api";
import {
  ConflictError,
  ERROR_CODE_HTTP_STATUS,
  ForbiddenError,
  finalizeGraphqlErrors,
  type GraphqlExecutionResultLike,
  isErrorCode,
  RateLimitExceededError,
  REDACTION_DEPTH_LIMIT_MARKER,
  REDACTION_ITEMS_LIMIT_MARKER,
  REDACTION_MAX_DEPTH,
  REDACTION_MAX_ITEMS,
  redactLogContext,
  ValidationError,
} from "@/backend/lib/errors";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Local helpers ───────────────────────────────────────────────────────────

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INACCESSIBLE_MARKER_LITERAL = "[INACCESSIBLE]";
const BOUNDARY_LOG_MARKER = "[ERROR]";

/** Predicate guard: value behaves like a plain object bag. */
function isObjectBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Guarded narrow: value must be a plain object bag, else loud failure. */
function demandBag(candidate: unknown, tag: string): Record<string, unknown> {
  if (!isObjectBag(candidate)) {
    throw new Error(`${tag} lost its record form`);
  }
  return candidate;
}

/** Guarded narrow: value must be an array, else loud failure. */
function demandArray(candidate: unknown, tag: string): readonly unknown[] {
  if (!Array.isArray(candidate)) {
    throw new Error(`${tag} lost its array form`);
  }
  return candidate;
}

interface SilencedOutcome<T> {
  readonly result: T;
  readonly logs: string;
}

interface RestorableSpy {
  mockRestore(): void;
}

let activeStreamSpies: readonly RestorableSpy[] | null = null;

function attachAccumulatingSpies(sink: (chunk: string) => void): void {
  const absorb = (chunk: unknown): boolean => {
    if (typeof chunk === "string") {
      sink(chunk);
    }
    return true;
  };
  const stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(absorb);
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(absorb);
  activeStreamSpies = [stdoutSpy, stderrSpy];
}

function restoreStreamSpies(): void {
  for (const streamSpy of activeStreamSpies ?? []) {
    streamSpy.mockRestore();
  }
  activeStreamSpies = null;
}

/**
 * Silences stdout/stderr around a SYNC body while accumulating emitted
 * chunks; storms emit hundreds of correlated log lines and the harness
 * asserts on them instead of flooding test output. Returns BOTH the body
 * result and the absorbed log text.
 */
function withSilencedStreams<T>(body: () => T): SilencedOutcome<T> {
  let accumulated = "";
  attachAccumulatingSpies(chunk => {
    accumulated += chunk;
  });
  try {
    return { result: body(), logs: accumulated };
  } finally {
    restoreStreamSpies();
  }
}

/** Async twin spanning an awaited body. */
async function withSilencedStreamsAsync<T>(body: () => Promise<T>): Promise<SilencedOutcome<T>> {
  let accumulated = "";
  attachAccumulatingSpies(chunk => {
    accumulated += chunk;
  });
  try {
    return { result: await body(), logs: accumulated };
  } finally {
    restoreStreamSpies();
  }
}

function countMarkerOccurrences(haystack: string, marker: string): number {
  let total = 0;
  let cursor = haystack.indexOf(marker);
  while (cursor !== -1) {
    total += 1;
    cursor = haystack.indexOf(marker, cursor + marker.length);
  }
  return total;
}

function localizedEn(key: "conflict" | "forbidden" | "rateLimitExceeded" | "validation"): string {
  return getServerTranslations("en").errorsTranslations[key];
}

/** Stand-in located error exposing the real throwable one hop inside. */
class LocatedChaosCarrier extends Error {
  public readonly originalError: unknown;
  public readonly path: readonly (string | number)[];

  constructor(source: unknown, responsePath: readonly (string | number)[]) {
    super("located carrier");
    this.name = "GraphQLError";
    this.originalError = source;
    this.path = responsePath;
  }
}

// ─── Tier 1 fixtures — six-class adversarial storm element ──────────────────

const STORM_ELEMENTS_PER_ROUND = 36; // 6 classes × 6 repetitions
const STORM_ROUNDS = 4;

function buildStormElement(index: number): GraphqlExecutionResultLike {
  const variantClass = index % 6;
  if (variantClass === 0) {
    return {
      errors: [new ConflictError(localizedEn("conflict"), { extensions: { idempotencyScope: "chaos-storm" } })],
    };
  }
  if (variantClass === 1) {
    const pgLeaf = Object.assign(new Error("pg insert failed"), { code: "23505" });
    return { errors: [new Error("wrapper shell", { cause: pgLeaf })] };
  }
  if (variantClass === 2) {
    return { errors: [{ thrownShape: index, depthBand: index % 3 }] };
  }
  if (variantClass === 3) {
    return {
      errors: [
        new ValidationError(localizedEn("validation"), [
          { field: `chaos.path.${index}`, code: "CHAOS_FIELD", message: `field message ${index}` },
        ]),
      ],
    };
  }
  if (variantClass === 4) {
    return { errors: [new RateLimitExceededError(localizedEn("rateLimitExceeded"))] };
  }
  return {
    errors: [new LocatedChaosCarrier(new ForbiddenError(localizedEn("forbidden")), ["mutation", "chaosTarget"])],
  };
}

function finalizeStormElement(elementIndex: number): string {
  return JSON.stringify(
    finalizeGraphqlErrors(buildStormElement(elementIndex), {
      locale: "en",
      requestId: `chaos-storm-${elementIndex}`,
      operationName: "ChaosStorm",
    })
  );
}

function snapshotStormSerial(): readonly string[] {
  return Array.from({ length: STORM_ELEMENTS_PER_ROUND }, (_, elementIndex) => finalizeStormElement(elementIndex));
}

async function runSingleStormRound(): Promise<readonly string[]> {
  const settledOutcomes = await Promise.allSettled(
    Array.from({ length: STORM_ELEMENTS_PER_ROUND }, (_, elementIndex) =>
      Promise.resolve().then(() => finalizeStormElement(elementIndex))
    )
  );

  const fulfilledPayloads: string[] = [];
  for (const outcome of settledOutcomes) {
    if (outcome.status !== "fulfilled") {
      throw new Error(`storm leg rejected unexpectedly: ${String(outcome.reason)}`);
    }
    fulfilledPayloads.push(outcome.value);
  }
  return fulfilledPayloads;
}

/** Masked class size per round (variantClass 2 records are the sole masks). */
const MASKED_ELEMENTS_PER_ROUND = STORM_ELEMENTS_PER_ROUND / 6;

// ─── Tier 1 — allSettled storms & shared-state drift ────────────────────────

describe("Tier 1 · allSettled storms — parallel purity without shared-state drift", () => {
  test(`${STORM_ROUNDS} rounds × ${STORM_ELEMENTS_PER_ROUND} legs byte-equal the sequential twin`, async () => {
    const pristineCapture = withSilencedStreams(() => snapshotStormSerial().join("\u241E"));
    const pristineBaseline = pristineCapture.result;
    expect(countMarkerOccurrences(pristineCapture.logs, BOUNDARY_LOG_MARKER)).toBe(MASKED_ELEMENTS_PER_ROUND);

    // Build-then-drain WITHOUT concurrent spies: silence windows must stay
    // strictly sequential (one global spy pair), so the rounds drain through
    // a promise chain instead of an awaited loop.
    const stormRoundThunks = Array.from(
      { length: STORM_ROUNDS },
      () => (): Promise<SilencedOutcome<readonly string[]>> => withSilencedStreamsAsync(() => runSingleStormRound())
    );
    const roundOutcomes = await stormRoundThunks.reduce(
      (drainedChain, nextRoundThunk) =>
        drainedChain.then(async drainedSoFar => [...drainedSoFar, await nextRoundThunk()]),
      Promise.resolve([] as readonly SilencedOutcome<readonly string[]>[])
    );

    for (const silenceOutcome of roundOutcomes) {
      // Exactly ONE declared masked-path call fires per masked element even
      // while every leg interleaves freely.
      expect(countMarkerOccurrences(silenceOutcome.logs, BOUNDARY_LOG_MARKER)).toBe(MASKED_ELEMENTS_PER_ROUND);
    }
    const roundBatches: readonly (readonly string[])[] = roundOutcomes.map(silenceOutcome => silenceOutcome.result);

    // Identical requestIds per slot make every comparison byte-for-byte.
    for (let elementIndex = 0; elementIndex < STORM_ELEMENTS_PER_ROUND; elementIndex += 1) {
      const referenceLine = pristineBaseline.split("\u241E")[elementIndex];
      for (let round = 0; round < STORM_ROUNDS; round += 1) {
        expect(roundBatches[round]?.[elementIndex]).toBe(referenceLine);
      }
    }

    expect(roundBatches).toHaveLength(STORM_ROUNDS);

    // Post-storm state-drift probe: pristine replay equals the pre-storm twin.
    expect(withSilencedStreams(() => snapshotStormSerial().join("\u241E")).result).toBe(pristineBaseline);

    // Module constants stayed untouched through the barrage.
    expect(REDACTION_MAX_DEPTH).toBe(6);
    expect(REDACTION_MAX_ITEMS).toBe(64);
    expect(isErrorCode("CONFLICT")).toBe(true);
    expect(isErrorCode("conflict")).toBe(false);
  });

  test("declared logging stays exactly-once per masked element on the sequential twin too", () => {
    const sequentialCapture = withSilencedStreams(() => snapshotStormSerial().join("\n"));
    const sequentialLogs = sequentialCapture.logs;
    expect(countMarkerOccurrences(sequentialLogs, BOUNDARY_LOG_MARKER)).toBe(MASKED_ELEMENTS_PER_ROUND);

    // Domain-classified variants ride their own observation channel and emit
    // zero masked-path lines for this corpus.
    expect(countMarkerOccurrences(sequentialLogs, "Unhandled non-domain error masked")).toBe(MASKED_ELEMENTS_PER_ROUND);
  });

  test("caller-owned inputs survive every invocation class unmutated", () => {
    const probeElementsByClass = Array.from({ length: 6 }, (_, variantClass) => buildStormElement(variantClass));
    const snapshotsBeforeInvocations = probeElementsByClass.map(element => JSON.stringify(element));

    withSilencedStreams(() => {
      for (let variantClass = 0; variantClass < 6; variantClass += 1) {
        finalizeStormElement(variantClass);
        finalizeStormElement(variantClass);
      }
    });

    expect(probeElementsByClass.map(element => JSON.stringify(element))).toEqual(snapshotsBeforeInvocations);
  });
});

// ─── Tier 2 fixtures — cyclic cause graphs ──────────────────────────────────

function buildSelfLoopError(): Error {
  const selfLoopNode = new Error("chaos-self-loop");
  return Object.assign(selfLoopNode, { cause: selfLoopNode });
}

function buildTangledPairHead(): Error {
  const pairTail = new Error("chaos-pair-tail");
  const pairHead = new Error("chaos-pair-head");
  Object.assign(pairHead, { cause: pairTail });
  Object.assign(pairTail, { cause: pairHead });
  return pairHead;
}

function buildTripleRingHead(): Error {
  const ringMiddle = new Error("chaos-ring-middle");
  const ringTail = new Error("chaos-ring-tail");
  const ringHead = new Error("chaos-ring-head");
  Object.assign(ringHead, { cause: ringMiddle });
  Object.assign(ringMiddle, { cause: ringTail });
  Object.assign(ringTail, { cause: ringHead });
  return ringHead;
}

function buildUniqueTailRingCarrier(): Record<string, unknown> {
  const ringNodes = [
    new Error("ring-a"),
    new Error("ring-b"),
    new Error("UNIQUE constraint failed: chaos.handshake_code"),
    new Error("ring-d"),
  ];
  for (let position = 0; position < ringNodes.length; position += 1) {
    Object.assign(ringNodes[position], { cause: ringNodes[(position + 1) % ringNodes.length] });
  }
  return {
    message: "located ring wrapper",
    originalError: ringNodes[0],
    extensions: {},
  };
}

describe("Tier 2 · cyclic cause graphs terminate deterministically", () => {
  test("self-loop / tangled pair / triple ring / UNIQUE-tail ring mask within budget", async () => {
    const cyclicCarriers: readonly unknown[] = [
      buildSelfLoopError(),
      buildTangledPairHead(),
      new LocatedChaosCarrier(buildTripleRingHead(), ["mutation", "tripleRing"]),
      buildUniqueTailRingCarrier(),
    ];

    const finalizeCyclicCorpus = (): string =>
      JSON.stringify(
        finalizeGraphqlErrors(
          { errors: cyclicCarriers },
          {
            locale: "en",
            requestId: "chaos-cyclic",
            operationName: "ChaosCyclic",
          }
        )
      );

    const startedAt = performance.now();
    const firstPass = await withSilencedStreamsAsync(async () => finalizeCyclicCorpus());
    const secondPass = await withSilencedStreamsAsync(async () => finalizeCyclicCorpus());
    const elapsedMilliseconds = performance.now() - startedAt;

    // Deterministic termination — byte-equal passes, generous time budget.
    expect(secondPass.result).toBe(firstPass.result);
    expect(elapsedMilliseconds).toBeLessThan(2500);

    // Exactly THREE masked-path calls per pass — the UNIQUE-tail ring is the
    // lone domain-classified element (localized CONFLICT), the rest mask.
    expect(countMarkerOccurrences(firstPass.logs, BOUNDARY_LOG_MARKER)).toBe(3);

    const decodedCycle: unknown = JSON.parse(firstPass.result);
    const cycleItems = demandArray(demandBag(decodedCycle, "cyclic result").errors, "cyclic errors[]");
    expect(cycleItems).toHaveLength(4);
    expect(cycleItems.length).toBeGreaterThan(0);

    const conflictItem = demandBag(cycleItems[3], "unique-tail item");
    expect(demandBag(conflictItem.extensions, "unique-tail extensions").code).toBe("CONFLICT");
    expect(conflictItem.message).toBe(localizedEn("conflict"));

    for (const maskedIndex of [0, 1, 2]) {
      const maskedItem = demandBag(cycleItems[maskedIndex], `masked cyclic item ${maskedIndex}`);
      expect(demandBag(maskedItem.extensions, "masked cyclic extensions").code).toBe("INTERNAL_SERVER_ERROR");
    }
    expect(JSON.parse(firstPass.result)).toEqual(JSON.parse(secondPass.result));
  });
});

// ─── Tier 2 fixtures — throwing getters & huge paths ────────────────────────

function buildThrowingGetterCarrier(): Record<string, unknown> {
  const hostileCarrier: Record<string, unknown> = {};
  Object.defineProperty(hostileCarrier, "message", {
    enumerable: true,
    configurable: true,
    get() {
      throw new RangeError("message getter detonated");
    },
  });
  Object.defineProperty(hostileCarrier, "extensions", {
    enumerable: true,
    configurable: true,
    get() {
      throw new RangeError("extensions getter detonated");
    },
  });
  return hostileCarrier;
}

function buildHugePath(length: number): readonly (string | number)[] {
  return Array.from({ length }, (_, segmentIndex) => (segmentIndex % 2 === 0 ? `seg-${segmentIndex}` : segmentIndex));
}

describe("Tier 2 · hostile carriers & huge paths cross deterministically", () => {
  test("throwing-getter carriers mask cleanly through guarded channels", () => {
    const getterCapture = withSilencedStreams(() =>
      JSON.stringify(
        finalizeGraphqlErrors(
          { errors: [buildThrowingGetterCarrier()] },
          {
            locale: "en",
            requestId: "chaos-getters",
          }
        )
      )
    );
    const getterWireLine = getterCapture.result;

    expect(countMarkerOccurrences(getterCapture.logs, BOUNDARY_LOG_MARKER)).toBe(1);
    const getterItem = demandBag(
      demandArray(demandBag(JSON.parse(getterWireLine), "getter result").errors, "getter errors")[0],
      "getter item"
    );
    const getterExtensions = demandBag(getterItem.extensions, "getter extensions");
    expect(Object.keys(getterExtensions).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "requestId"]);
    expect(getterExtensions.requestId).toBe("chaos-getters");

    // Redaction counterpart: inaccessible bag values collapse, siblings live.
    const fragileBag: Record<string, unknown> = { plainNeighbor: "stays-visible" };
    Object.defineProperty(fragileBag, "volatileSlot", {
      enumerable: true,
      configurable: true,
      get() {
        throw new ReferenceError("bag getter detonated");
      },
    });
    const redactedFragile = redactLogContext(fragileBag);
    expect(redactedFragile.volatileSlot).toBe(INACCESSIBLE_MARKER_LITERAL);
    expect(redactedFragile.plainNeighbor).toBe("stays-visible");
  });

  test("huge path (60 000 segments) crosses verbatim; redactor slices it boundedly", () => {
    const hugePath = buildHugePath(60000);
    const wideCarrier: Record<string, unknown> = {
      message: "wide located failure",
      path: hugePath,
      extensions: {},
    };

    const startedAt = performance.now();
    const wideCapture = withSilencedStreams(() =>
      JSON.stringify(finalizeGraphqlErrors({ errors: [wideCarrier] }, { locale: "en", requestId: "chaos-wide" }))
    );
    const finalizeOutcome = wideCapture.result;
    const sliceView = redactLogContext({ wideTable: hugePath }).wideTable;
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(elapsedMilliseconds).toBeLessThan(4000);

    // Finalizer preserves positional fidelity END-TO-END (verbatim copy).
    const wideItem = demandBag(
      demandArray(demandBag(JSON.parse(finalizeOutcome), "wide result").errors, "wide errors")[0],
      "wide item"
    );
    const carriedPath = demandArray(wideItem.path, "wide path");
    expect(carriedPath).toHaveLength(hugePath.length);
    expect(carriedPath[0]).toBe(hugePath[0]);
    expect(carriedPath[hugePath.length - 1]).toBe(hugePath[hugePath.length - 1]);

    // The REDACTOR, walking instead of transporting, enforces its hard cap.
    const slicedRows = demandArray(sliceView, "sliced wide table");
    expect(slicedRows).toHaveLength(REDACTION_MAX_ITEMS + 1);
    expect(slicedRows[REDACTION_MAX_ITEMS]).toBe(REDACTION_ITEMS_LIMIT_MARKER);
    expect(slicedRows[0]).toBe(hugePath[0]);
    expect(countMarkerOccurrences(wideCapture.logs, BOUNDARY_LOG_MARKER)).toBe(1);
  });
});

// ─── Tier 2 fixtures — proxies & exotic containers across redaction ─────────

interface FreshGetProxyHandle {
  readonly proxy: Record<string, unknown>;
  readonly sensitiveGetCount: () => number;
}

/**
 * Proxy manufacturing a FRESH record per property read — infinitely deep to
 * any naive recursive walker. Sensitive keys must NEVER reach the trap.
 */
function buildFreshGetProxy(): FreshGetProxyHandle {
  const readTelemetry = { sensitiveGets: 0 };
  const emptyTarget: Record<string, unknown> = {};
  let selfProxyRef: Record<string, unknown> | null = null;
  const freshProxy = new Proxy(emptyTarget, {
    ownKeys() {
      return ["visibleField", "zoomAccessToken"];
    },
    getOwnPropertyDescriptor(_target, propertyKey) {
      if (propertyKey === "visibleField" || propertyKey === "zoomAccessToken") {
        return { enumerable: true, configurable: true, writable: true, value: undefined };
      }
      return undefined;
    },
    get(_target, propertyKey): unknown {
      if (propertyKey === "zoomAccessToken") {
        readTelemetry.sensitiveGets += 1;
        return "[never-read]";
      }
      // Self-similar dive: every visibleField hop re-enters THIS proxy, so a
      // naive recursive walker would spin forever — the depth cap must sever
      // the loop while bounded walkers finish instantly.
      return selfProxyRef ?? { diveDeeper: "warming-up" };
    },
  });
  selfProxyRef = freshProxy;
  return { proxy: freshProxy, sensitiveGetCount: () => readTelemetry.sensitiveGets };
}

/** Array-flavored proxy claiming a billion cells but serving a bounded few. */
function buildVirtualGiantArray(): readonly unknown[] {
  const arrayTarget: number[] = [];
  return new Proxy(arrayTarget, {
    get(_target, propertyKey): unknown {
      if (propertyKey === "length") {
        return 1_000_000_000;
      }
      if (typeof propertyKey === "string" && /^\d+$/u.test(propertyKey)) {
        const numericIndex = Number(propertyKey);
        return numericIndex < 1024 ? `cell-${numericIndex}` : undefined;
      }
      return undefined;
    },
  });
}

describe("Tier 2 · proxies & exotic structures cross redaction WITHOUT unbounded recursion", () => {
  test("fresh-get proxy: depth cap collapses it; sensitive key never reaches the trap", () => {
    const proxyHandle = buildFreshGetProxy();

    expect(Array.from(Object.keys(proxyHandle.proxy)).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "visibleField",
      "zoomAccessToken",
    ]);

    const startedAt = performance.now();
    const proxyJson = JSON.stringify(redactLogContext({ hostileRoot: proxyHandle.proxy }));
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(elapsedMilliseconds).toBeLessThan(2000);
    expect(proxyJson).toContain('"zoomAccessToken":"[REDACTED]"'); // short-circuited pre-read
    expect(proxyHandle.sensitiveGetCount()).toBe(0); // trap PROOF: zero reads
    expect(proxyJson.includes(REDACTION_DEPTH_LIMIT_MARKER)).toBe(true); // fresh objects collapsed
  });

  test("self-referential structure terminates at the documented depth bound", () => {
    const selfReferentialNode: Record<string, unknown> = { tag: "cycle-seed" };
    selfReferentialNode.selfReference = selfReferentialNode;

    const cycleJson = JSON.stringify(redactLogContext({ cycleRoot: selfReferentialNode }));
    expect(cycleJson.includes(REDACTION_DEPTH_LIMIT_MARKER)).toBe(true);
    expect(cycleJson).toContain('"cycle-seed"');
  });

  test("virtual billion-cell array is served from its bounded window only", () => {
    const virtualGiant = buildVirtualGiantArray();
    expect(Array.isArray(virtualGiant)).toBe(true);

    const startedAt = performance.now();
    const boundedMatrix = redactLogContext({ matrixRows: virtualGiant }).matrixRows;
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(elapsedMilliseconds).toBeLessThan(2000);
    const matrixView = demandArray(boundedMatrix, "matrix rows");
    expect(matrixView).toHaveLength(REDACTION_MAX_ITEMS + 1);
    expect(matrixView[REDACTION_MAX_ITEMS]).toBe(REDACTION_ITEMS_LIMIT_MARKER);
    expect(matrixView[0]).toBe("cell-0");
  });
});

// ─── Tier 2 fixtures — rejected non-Error zoo ───────────────────────────────

function regularNamedChaosThrower(): string {
  return "never-invoked";
}

const arrowChaosThrower = (): number => -1;

class ChaosZooClass {
  public readonly zooTag = "chaos-zoo-class";
}

const generatorChaosObject: Generator<number> = (function* generateChaosValues(): Generator<number> {
  yield 7;
})();

const functionProxyThrowable: unknown = new Proxy(regularNamedChaosThrower, {
  get(target, propertyKey, receiver) {
    if (propertyKey === "nickname") {
      return "maskMeProxy";
    }
    return Reflect.get(target, propertyKey, receiver);
  },
});

const boxedSymbolThrowable: object = Object(Symbol("chaos-zoo-boxed"));

const REJECTION_ZOO: readonly unknown[] = [
  regularNamedChaosThrower,
  arrowChaosThrower,
  ChaosZooClass,
  generatorChaosObject,
  Symbol("chaos-zoo-tag"),
  42n,
  functionProxyThrowable,
  boxedSymbolThrowable,
];

describe("Tier 2 · rejected non-Error zoo degrades to well-formed masks on BOTH surfaces", () => {
  test("every zoo member yields INTERNAL_SERVER_ERROR envelopes with single correlated logs", async () => {
    const zooRestResponses: Response[] = [];
    let zooWireLines: string[] = [];

    const zooCapture = withSilencedStreams((): void => {
      zooWireLines = REJECTION_ZOO.map(zooMember =>
        JSON.stringify(finalizeGraphqlErrors({ errors: [zooMember] }, { locale: "en", requestId: "chaos-zoo-gql" }))
      );
      for (const zooMember of REJECTION_ZOO) {
        const zooResponse = apiErrorResponse(zooMember, { locale: "en", requestId: "chaos-zoo-rest" });
        expect(zooResponse.status).toBe(ERROR_CODE_HTTP_STATUS.INTERNAL_SERVER_ERROR);
        zooRestResponses.push(zooResponse);
      }
    });
    const zooLogChunk = zooCapture.logs;

    // Two masked paths per member (one GraphQL element + one REST envelope).
    expect(countMarkerOccurrences(zooLogChunk, BOUNDARY_LOG_MARKER)).toBe(REJECTION_ZOO.length * 2);

    const zooEnvelopeTexts = await Promise.all(zooRestResponses.map(zooResponse => zooResponse.text()));

    for (let memberIndex = 0; memberIndex < REJECTION_ZOO.length; memberIndex += 1) {
      const wireLine = zooWireLines[memberIndex];
      expect(() => JSON.parse(wireLine)).not.toThrow();

      const gqlItem = demandBag(
        demandArray(demandBag(JSON.parse(wireLine), "zoo result").errors, "zoo errors")[0],
        `zoo gql item ${memberIndex}`
      );
      const gqlExtensions = demandBag(gqlItem.extensions, "zoo gql extensions");
      expect(Object.keys(gqlExtensions).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "requestId"]);
      expect(gqlExtensions.code).toBe("INTERNAL_SERVER_ERROR");
      expect(gqlExtensions.requestId).toBe("chaos-zoo-gql");
      expect(gqlItem.message).toBe(getServerTranslations("en").errorsTranslations.internalServerError);

      const envelopeText = zooEnvelopeTexts[memberIndex];
      expect(() => JSON.parse(envelopeText)).not.toThrow();
      const envelopeBag = demandBag(JSON.parse(envelopeText), `zoo rest envelope ${memberIndex}`);
      const restErrorBag = demandBag(envelopeBag.error, "zoo rest error bag");
      expect(Object.keys(restErrorBag).toSorted((a, b) => a.localeCompare(b))).toEqual([
        "code",
        "message",
        "requestId",
      ]);
      expect(restErrorBag.code).toBe("INTERNAL_SERVER_ERROR");
      expect(restErrorBag.requestId).toBe("chaos-zoo-rest");
    }
  });
});

// ─── Tier 3 — resolveRequestId under hostile headers ─────────────────────────

type HeaderExpectation = "generated" | "honored";

interface HeaderBatteryRow {
  readonly tag: string;
  readonly returnedValue: unknown;
  readonly expectation: HeaderExpectation;
}

const BOUNDARY_LENGTH_VALUE = "L".repeat(REQUEST_ID_MAX_LENGTH);

const HEADER_BATTERY_ROWS: readonly HeaderBatteryRow[] = [
  { tag: "multi-value-comma-smuggle", returnedValue: "abc,def", expectation: "generated" },
  { tag: "eight-times-oversized", returnedValue: "x".repeat(REQUEST_ID_MAX_LENGTH * 8), expectation: "generated" },
  { tag: "one-over-the-boundary", returnedValue: `${BOUNDARY_LENGTH_VALUE}x`, expectation: "generated" },
  { tag: "trim-to-empty", returnedValue: "   ", expectation: "generated" },
  { tag: "nul-embedded", returnedValue: "id\u0000split", expectation: "generated" },
  { tag: "newline-injection", returnedValue: "a\nb", expectation: "generated" },
  { tag: "tab-character", returnedValue: "a\tb", expectation: "generated" },
  { tag: "object-return", returnedValue: { spoofed: "id" }, expectation: "generated" },
  { tag: "symbol-return", returnedValue: Symbol("header-symbol"), expectation: "generated" },
  { tag: "empty-string", returnedValue: "", expectation: "generated" },
  { tag: "plain-honored", returnedValue: "chaos-correlation-777", expectation: "honored" },
  { tag: "padded-honored", returnedValue: "  chaos-padded-42  ", expectation: "honored" },
  { tag: "exact-boundary-honored", returnedValue: BOUNDARY_LENGTH_VALUE, expectation: "honored" },
];

const HONORED_RESOLUTIONS: Readonly<Record<string, string>> = {
  "plain-honored": "chaos-correlation-777",
  "padded-honored": "chaos-padded-42",
  "exact-boundary-honored": BOUNDARY_LENGTH_VALUE,
};

/** Minimal `RequestHeaderReader` stub serving one canned value. */
function readerReturning(returnedValue: unknown): { readonly get: (name: string) => unknown } {
  return {
    get: (requestedName: string) => (requestedName === "x-request-id" ? returnedValue : undefined),
  };
}

describe("Tier 3 · resolveRequestId hostile-header battery", () => {
  test("every smuggle shape loses to a fresh UUIDv4; every accepted shape echoes verbatim", () => {
    for (const batteryRow of HEADER_BATTERY_ROWS) {
      const headerReader = readerReturning(batteryRow.returnedValue);
      const firstResolution = resolveRequestId(headerReader);

      if (batteryRow.expectation === "honored") {
        // Unknown-bridge keeps the guard real for exotic-key future edits.
        const expectedEchoHolder: unknown = HONORED_RESOLUTIONS[batteryRow.tag];
        if (typeof expectedEchoHolder !== "string") {
          throw new Error(`missing honored expectation for ${batteryRow.tag}`);
        }
        expect(firstResolution).toBe(expectedEchoHolder);
        // Honored-path determinism: same header ⇒ same id across repeats.
        expect(resolveRequestId(headerReader)).toBe(firstResolution);
      } else {
        expect(UUID_V4_PATTERN.test(firstResolution)).toBe(true);
        // Rejection path mints a FRESH id each call (never echoes/truncates).
        expect(resolveRequestId(headerReader)).not.toBe(firstResolution);
      }
    }
  });

  test("generation burst (400 legs): legit ids echo; hostile ids mint uniquely", async () => {
    const OVERSIZED_LEG = "x".repeat(REQUEST_ID_MAX_LENGTH * 2);
    const HOSTILE_ROTATION: readonly unknown[] = ["a,b", "", OVERSIZED_LEG, "ctl\u0007id"];
    const BURST_SIZE = 400;

    const burstReaders = Array.from({ length: BURST_SIZE }, (_, legIndex) => {
      if (legIndex % 2 === 0) {
        return {
          kind: "legit" as const,
          reader: readerReturning(`storm-legit-${legIndex}`),
          echoed: `storm-legit-${legIndex}`,
        };
      }
      return {
        kind: "hostile" as const,
        reader: readerReturning(HOSTILE_ROTATION[legIndex % HOSTILE_ROTATION.length]),
        echoed: "",
      };
    });

    const burstResolutions = await Promise.all(
      burstReaders.map((burstLeg, legIndex) =>
        Promise.resolve().then(() => ({ legIndex, resolution: resolveRequestId(burstLeg.reader) }))
      )
    );

    const hostileMintedIds = new Set<string>();
    for (const { legIndex, resolution } of burstResolutions) {
      const burstLeg = burstReaders[legIndex];
      if (!burstLeg) {
        throw new Error("burst bookkeeping desynchronized");
      }
      if (burstLeg.kind === "legit") {
        expect(resolution).toBe(burstLeg.echoed);
      } else {
        expect(UUID_V4_PATTERN.test(resolution)).toBe(true);
        hostileMintedIds.add(resolution);
      }
    }

    const hostileLegCount = burstReaders.filter(leg => leg.kind === "hostile").length;
    expect(hostileMintedIds.size).toBe(hostileLegCount); // zero collisions across the burst
  });
});
