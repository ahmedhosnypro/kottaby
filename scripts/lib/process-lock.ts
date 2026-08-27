/**
 * PROCESS LOCK — Per-Tool Cross-Process Mutual Exclusion & FIFO Queueing
 *
 * Provides cross-process synchronization for resource-heavy operations
 * (tsgo, biome, oxlint, lint-service, sub-loop quality checks).
 *
 * Architecture: PER-TOOL locks (not a single global lock)
 *   Each tool class has its own independent lock namespace:
 *   - `.quality-gate-lock/tsgo/`        → serializes: tsgo, sub-loop tsgo, restore-next-env-dts
 *   - `.quality-gate-lock/biome/`       → serializes: biome:check (per-file & full-repo)
 *   - `.quality-gate-lock/oxlint/`      → serializes: oxlint (per-file & full-repo)
 *   - `.quality-gate-lock/lint/`        → serializes: lint-service (type-aware ESLint)
 *   - `.quality-gate-lock/duplicates/`  → serializes: jscpd duplication checks
 *   - `.quality-gate-lock/build/`       → serializes: next build, build:test
 *   - `.quality-gate-lock/test/`        → serializes: bun test runs
 *   - `.quality-gate-lock/default/`     → fallback for uncategorized tasks
 *
 * This allows tsgo and biome to run concurrently across parallel subagents,
 * while still serializing same-tool calls to prevent CPU/RAM contention.
 *
 * Features:
 *   - Atomic OS lockfile per tool class (`<tool>/active.json`)
 *   - Guaranteed FIFO queuing via timestamped ticket files in `<tool>/queue/`
 *   - In-process re-entrancy (nested lock calls within the same PID proceed immediately)
 *   - Deadlock recovery (stale lock/ticket cleanup for dead PIDs or expired locks)
 *   - Process signal/exit handlers to clean up locks on termination
 */

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ActiveLockInfo {
  pid: number;
  acquiredAt: number;
  description: string;
  reentryCount: number;
}

export interface QueueTicketInfo {
  pid: number;
  timestamp: number;
  ticketId: string;
  description: string;
}

// ─── Tool Classification ─────────────────────────────────────────────────────

/**
 * Derive the lock namespace (tool class) from the task description.
 * Each namespace gets its own independent lock directory.
 */
function getLockNamespace(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("tsgo") || d.includes("restore-next-env-dts") || d.includes("typescript")) return "tsgo";
  if (d.includes("biome")) return "biome";
  if (d.includes("oxlint")) return "oxlint";
  if (
    d.includes("lint-service") ||
    d.includes("lint:type-aware") ||
    d.includes("lint:fix") ||
    d === "lint" ||
    d.startsWith("lint ")
  )
    return "lint";
  if (d.includes("duplicates") || d.includes("jscpd")) return "duplicates";
  if (d.includes("build")) return "build";
  if (d.startsWith("test") || d.includes("test:") || d.includes("test ")) return "test";
  return "default";
}

/**
 * Check if a task description is exempt from the 5-minute timeout.
 */
export function isTimeoutExempt(description: string): boolean {
  const d = description.toLowerCase();
  return (
    d.includes("quality-gate") ||
    d.includes("duplicates") ||
    d.includes("jscpd") ||
    d.includes("lint-service") ||
    d.startsWith("test") ||
    d.includes("test:") ||
    d.includes("test ")
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const LOCK_BASE_DIR = resolve(PROJECT_ROOT, ".quality-gate-lock");

/** Maximum age for a lock before considering it stale (5 minutes) */
const MAX_LOCK_AGE_MS = 5 * 60 * 1000;

/** Queue polling interval in milliseconds */
const POLL_INTERVAL_MS = 250;

const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const NC = "\x1b[0m";

// ─── Per-namespace path helpers ──────────────────────────────────────────────

function getLockDir(namespace: string): string {
  return join(LOCK_BASE_DIR, namespace);
}

function getQueueDir(namespace: string): string {
  return join(getLockDir(namespace), "queue");
}

function getActiveLockFile(namespace: string): string {
  return join(getLockDir(namespace), "active.json");
}

// ─── State (per-namespace) ───────────────────────────────────────────────────

// Reentry tracking: namespace → count
const reentryCountByNs = new Map<string, number>();
// Release callbacks: namespace → Set<() => void>
const activeReleasesByNs = new Map<string, Set<() => void>>();
let exitHandlersAttached = false;

function getReentryCount(ns: string): number {
  return reentryCountByNs.get(ns) ?? 0;
}
function setReentryCount(ns: string, val: number): void {
  reentryCountByNs.set(ns, val);
}
function getReleases(ns: string): Set<() => void> {
  let set = activeReleasesByNs.get(ns);
  if (!set) {
    set = new Set();
    activeReleasesByNs.set(ns, set);
  }
  return set;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = Reflect.get(err, "code");
  return typeof code === "string" ? code : undefined;
}

function asyncSleep(ms: number): Promise<void> {
  return new Promise(done => setTimeout(done, ms));
}

/**
 * Check if a process PID is alive and actively running (not dead, zombie, or stopped).
 * Returns true if process exists and is in an active state, false otherwise.
 */
export function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  // 1. Basic OS signal check (works across all platforms)
  try {
    process.kill(pid, 0);
  } catch (err: unknown) {
    // If error is not EPERM (e.g. ESRCH = no such process), process does not exist
    if (getErrorCode(err) !== "EPERM") {
      return false;
    }
  }

  // 2. Linux /proc inspection for process state & zombie/stopped detection
  try {
    const statPath = `/proc/${pid}/stat`;
    if (existsSync(statPath)) {
      const statContent = readFileSync(statPath, "utf8");
      const lastParen = statContent.lastIndexOf(")");
      if (lastParen !== -1 && lastParen + 2 < statContent.length) {
        const stateChar = statContent.charAt(lastParen + 2);
        // States:
        // 'R' (running), 'S' (sleeping), 'D' (disk sleep), 'I' (idle) -> Running / active
        // 'Z' (zombie), 'T' (stopped by job control/Ctrl+Z), 't' (tracing stop), 'X'/'x' (dead), 'K' (wakekill), 'W' (paging) -> NOT running
        if (stateChar === "Z" || stateChar === "T" || stateChar === "t" || stateChar === "X" || stateChar === "x") {
          return false;
        }
      }
    }

    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (existsSync(cmdlinePath)) {
      const cmdline = readFileSync(cmdlinePath, "utf8");
      if (cmdline.length === 0) {
        return false;
      }
    }
  } catch {
    // If reading /proc fails or on non-Linux, the basic kill(pid, 0) check above stands
  }

  return true;
}

/**
 * Backward compatibility alias for isPidRunning
 */
export const isPidAlive = isPidRunning;

/**
 * Ensure lock directories exist for a given namespace.
 */
function ensureLockDirs(ns: string): void {
  const lockDir = getLockDir(ns);
  const queueDir = getQueueDir(ns);
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }
  if (!existsSync(queueDir)) {
    mkdirSync(queueDir, { recursive: true });
  }
}

/**
 * Create a timestamped ticket file in the queue directory for a namespace.
 */
function createQueueTicket(ns: string, description: string): { ticketPath: string; ticketInfo: QueueTicketInfo } {
  ensureLockDirs(ns);
  const queueDir = getQueueDir(ns);
  const timestamp = Date.now();
  const ticketId = randomUUID().substring(0, 8);
  const fileName = `${timestamp}_${process.pid}_${ticketId}.json`;
  const ticketPath = join(queueDir, fileName);

  const ticketInfo: QueueTicketInfo = {
    pid: process.pid,
    timestamp,
    ticketId,
    description,
  };

  try {
    const fd = openSync(ticketPath, "wx");
    writeSync(fd, JSON.stringify(ticketInfo, null, 2));
    closeSync(fd);
  } catch (err: unknown) {
    if (err !== null) {
      // Retry once if file exists (extremely unlikely)
      const altFileName = `${timestamp + 1}_${process.pid}_${ticketId}.json`;
      const altPath = join(queueDir, altFileName);
      const fd = openSync(altPath, "wx");
      writeSync(fd, JSON.stringify(ticketInfo, null, 2));
      closeSync(fd);
      return { ticketPath: altPath, ticketInfo };
    }
  }

  return { ticketPath, ticketInfo };
}

function parseTicketFile(queueDir: string, file: string): QueueTicketInfo | null {
  if (!file.endsWith(".json")) return null;
  const ticketPath = join(queueDir, file);
  try {
    const content = readFileSync(ticketPath, "utf8");
    const info: QueueTicketInfo = JSON.parse(content);
    const alive = isPidRunning(info.pid);
    const exempt = isTimeoutExempt(info.description);
    if (!alive || (!exempt && Date.now() - info.timestamp > MAX_LOCK_AGE_MS)) {
      try {
        unlinkSync(ticketPath);
      } catch {
        /* ignore cleanup error */
      }
      return null;
    }
    return info;
  } catch {
    try {
      unlinkSync(ticketPath);
    } catch {
      /* ignore cleanup error */
    }
    return null;
  }
}

/**
 * Scan queue directory for a namespace, remove stale tickets,
 * and return valid tickets sorted by timestamp ascending (FIFO).
 */
function getValidQueueTickets(ns: string): { file: string; info: QueueTicketInfo }[] {
  ensureLockDirs(ns);
  const queueDir = getQueueDir(ns);
  try {
    const files = readdirSync(queueDir);
    const valid: { file: string; info: QueueTicketInfo }[] = [];

    for (const file of files) {
      const info = parseTicketFile(queueDir, file);
      if (info) {
        valid.push({ file, info });
      }
    }

    valid.sort((a, b) => {
      if (a.info.timestamp !== b.info.timestamp) {
        return a.info.timestamp - b.info.timestamp;
      }
      return a.file.localeCompare(b.file);
    });

    return valid;
  } catch {
    return [];
  }
}

/**
 * Read the current active lock for a namespace, cleaning it up if stale.
 */
function getActiveLock(ns: string): ActiveLockInfo | null {
  const activeLockFile = getActiveLockFile(ns);
  if (!existsSync(activeLockFile)) return null;
  try {
    const content = readFileSync(activeLockFile, "utf8");
    const info: ActiveLockInfo = JSON.parse(content);
    const alive = isPidRunning(info.pid);
    const exempt = isTimeoutExempt(info.description);
    if (!alive || (!exempt && Date.now() - info.acquiredAt > MAX_LOCK_AGE_MS)) {
      console.log(`${YELLOW}[process-lock]${NC} Cleaning up stale lock held by PID ${info.pid} (${info.description})`);
      try {
        unlinkSync(activeLockFile);
      } catch {
        /* ignore stale lock cleanup error */
      }
      return null;
    }
    return info;
  } catch {
    try {
      unlinkSync(activeLockFile);
    } catch {
      /* ignore stale lock cleanup error */
    }
    return null;
  }
}

/**
 * Clean up all stale active locks and queue tickets across all lock namespaces.
 */
export function cleanAllStaleLocks(): void {
  if (!existsSync(LOCK_BASE_DIR)) return;
  try {
    const entries = readdirSync(LOCK_BASE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const ns = entry.name;
      // 1. Check active lock in namespace
      getActiveLock(ns);
      // 2. Check queue tickets in namespace
      getValidQueueTickets(ns);
    }
  } catch {
    /* ignore scan errors */
  }
}

/**
 * Atomically claim the active lock file for a namespace.
 */
function claimActiveLock(ns: string, description: string): ActiveLockInfo | null {
  ensureLockDirs(ns);
  const activeLockFile = getActiveLockFile(ns);
  const info: ActiveLockInfo = {
    pid: process.pid,
    acquiredAt: Date.now(),
    description,
    reentryCount: 1,
  };
  try {
    const fd = openSync(activeLockFile, "wx");
    writeSync(fd, JSON.stringify(info, null, 2));
    closeSync(fd);
    return info;
  } catch (err: unknown) {
    if (getErrorCode(err) === "EEXIST") {
      return null;
    }
    throw err;
  }
}

/**
 * Create a release callback that cleans up the active lock for a namespace.
 */
function createReleaseCallback(ns: string, description: string): () => void {
  const activeLockFile = getActiveLockFile(ns);
  const releases = getReleases(ns);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const count = getReentryCount(ns) - 1;
    setReentryCount(ns, count);
    releases.delete(release);
    if (count <= 0) {
      setReentryCount(ns, 0);
      try {
        unlinkSync(activeLockFile);
      } catch {
        /* ignore active lock release error */
      }
      console.log(`${CYAN}[process-lock]${NC} Released lock for "${description}" (PID: ${process.pid})`);
    }
  };
  releases.add(release);
  return release;
}

const activeTickets = new Set<string>();

/**
 * Attach process exit handlers to clean up all active locks and tickets on crash/exit/signals.
 */
function attachExitHandlers(): void {
  if (exitHandlersAttached) return;
  exitHandlersAttached = true;

  const cleanupAll = () => {
    for (const releases of activeReleasesByNs.values()) {
      for (const release of releases) {
        try {
          release();
        } catch {
          /* ignore process exit cleanup error */
        }
      }
    }
    for (const ticketPath of activeTickets) {
      try {
        unlinkSync(ticketPath);
      } catch {
        /* ignore ticket cleanup error */
      }
    }
    activeTickets.clear();
  };

  process.on("exit", cleanupAll);
  process.on("SIGINT", () => {
    cleanupAll();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanupAll();
    process.exit(143);
  });
  process.on("SIGHUP", () => {
    cleanupAll();
    process.exit(129);
  });
  process.on("SIGQUIT", () => {
    cleanupAll();
    process.exit(131);
  });
  process.on("SIGBREAK", () => {
    cleanupAll();
    process.exit(130);
  });
}

// Attach handlers eagerly on module import
attachExitHandlers();

function getQueuePosition(ns: string, ticketInfo: QueueTicketInfo): { pos: number; total: number } {
  const validTickets = getValidQueueTickets(ns);
  const myIndex = validTickets.findIndex(t => t.info.ticketId === ticketInfo.ticketId);
  const pos = myIndex >= 0 ? myIndex + 1 : validTickets.length + 1;
  return { pos, total: validTickets.length };
}

function logIfStateChanged(stateStr: string, lastLoggedState: string, message: string): string {
  if (stateStr !== lastLoggedState) {
    console.log(message);
  }
  return stateStr;
}

function checkQueuePosition(
  ns: string,
  ticketInfo: QueueTicketInfo,
  activePid: number,
  activeDesc: string,
  lastLoggedState: string
): string {
  const { pos, total } = getQueuePosition(ns, ticketInfo);
  const stateStr = `held_by_${activePid}_pos_${pos}_total_${total}`;
  return logIfStateChanged(
    stateStr,
    lastLoggedState,
    `${YELLOW}[process-lock]${NC} Lock held by PID ${activePid} (${activeDesc}). Position in queue: ${pos}/${total}. Waiting...`
  );
}

function checkWaitingPosition(ns: string, ticketInfo: QueueTicketInfo, lastLoggedState: string): string {
  const { pos, total } = getQueuePosition(ns, ticketInfo);
  const stateStr = `waiting_pos_${pos}_total_${total}`;
  return logIfStateChanged(
    stateStr,
    lastLoggedState,
    `${YELLOW}[process-lock]${NC} Waiting for turn in queue. Position: ${pos}/${total}...`
  );
}

function isProcessDescendantOf(activePid: number): boolean {
  if (process.pid === activePid) return true;
  let currentPid = process.ppid;
  let depth = 0;
  while (currentPid > 1 && depth < 5) {
    if (currentPid === activePid) return true;
    try {
      const statPath = `/proc/${currentPid}/stat`;
      if (!existsSync(statPath)) break;
      const statContent = readFileSync(statPath, "utf8");
      const lastParen = statContent.lastIndexOf(")");
      if (lastParen === -1) break;
      const rest = statContent.substring(lastParen + 2).split(" ");
      const ppid = Number.parseInt(rest[1], 10);
      if (Number.isNaN(ppid) || ppid <= 1) break;
      currentPid = ppid;
      depth++;
    } catch {
      break;
    }
  }
  return false;
}

// ─── Core Lock API ──────────────────────────────────────────────────────────

/**
 * Acquire cross-process lock for a specific tool namespace.
 * Returns a release function that MUST be called when done.
 */
export async function acquireProcessLock(description: string): Promise<() => void> {
  const ns = getLockNamespace(description);
  ensureLockDirs(ns);
  attachExitHandlers();

  // Sweep and clean up any stale locks/tickets from dead or stopped processes
  cleanAllStaleLocks();

  // 1. Re-entrancy check (same process or descendant process spawned by lock owner)
  const currentActive = getActiveLock(ns);
  if (currentActive && isProcessDescendantOf(currentActive.pid)) {
    setReentryCount(ns, getReentryCount(ns) + 1);
    return createReleaseCallback(ns, description);
  }

  // 2. Queue registration
  const { ticketPath, ticketInfo } = createQueueTicket(ns, description);
  activeTickets.add(ticketPath);
  console.log(`${CYAN}[process-lock]${NC} Enqueued request for "${description}" (PID: ${process.pid})`);

  const cleanupTicket = () => {
    activeTickets.delete(ticketPath);
    try {
      unlinkSync(ticketPath);
    } catch {
      /* ignore ticket removal error */
    }
  };

  const poll = async (lastState: string): Promise<() => void> => {
    const active = getActiveLock(ns);
    let state = lastState;

    if (active) {
      if (active.pid === process.pid) {
        cleanupTicket();
        setReentryCount(ns, 1);
        return createReleaseCallback(ns, description);
      }
      state = checkQueuePosition(ns, ticketInfo, active.pid, active.description, state);
    } else {
      const validTickets = getValidQueueTickets(ns);
      const isFirst = validTickets.length === 0 || validTickets[0].info.ticketId === ticketInfo.ticketId;

      if (isFirst && claimActiveLock(ns, description)) {
        cleanupTicket();
        setReentryCount(ns, 1);
        console.log(
          `${GREEN}[process-lock]${NC} Acquired lock for "${description}" (PID: ${process.pid}). Executing...`
        );
        return createReleaseCallback(ns, description);
      }
      state = checkWaitingPosition(ns, ticketInfo, state);
    }

    await asyncSleep(POLL_INTERVAL_MS);
    return poll(state);
  };

  // 3. Wait loop via recursive async polling
  try {
    return await poll("");
  } finally {
    // If we exit unexpectedly without returning, ensure ticket is cleaned up
    cleanupTicket();
  }
}

/**
 * Wrap an async function in process lock execution.
 * Enforces a 5-minute timeout for all tasks EXCEPT exempt tasks (Tests, Duplicates, Lint-Service, Quality-Gate).
 */
export async function withProcessLock<T>(description: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireProcessLock(description);

  const exempt = isTimeoutExempt(description);
  const MAX_TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const timeoutPromise = exempt
    ? null
    : new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          const msg =
            `\n\x1b[31m❌ [process-lock] TASK TIMEOUT EXCEEDED (5 minutes / 300,000ms)\x1b[0m\n` +
            `Task "${description}" took longer than 5 minutes (300000ms) to complete.\n` +
            `This usually indicates an un-excluded build/dist directory, an infinite loop, or resource contention.\n` +
            `Fix the underlying issue before running again.\n`;
          console.error(msg);
          reject(new Error(msg));
        }, MAX_TASK_TIMEOUT_MS);
      });

  try {
    if (timeoutPromise) {
      return await Promise.race([fn(), timeoutPromise]);
    }
    return await fn();
  } catch (error) {
    if (timedOut) {
      throw error;
    }
    throw error;
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    release();
  }
}
