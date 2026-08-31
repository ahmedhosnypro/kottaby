// Parallel Test Runner for Backend Services (prevents Bun module registry/mock pollution across service test files).
import { runParallelTests } from "@/test/scripts/run-parallel-tests";

// Each worker creates a pg pool (max: 3 in test env via factory.ts).
// Cap workers so total connections stay well within PostgreSQL's max_connections.
// With max 3 per pool: 8 workers x 3 = 24 connections (leaves headroom for other clients).
const isSqlite = process.env.DB_PROVIDER?.toLowerCase() === "sqlite";

await runParallelTests({
  pattern: "**/*.test.ts",
  cwd: "backend/services",
  maxWorkers: isSqlite ? 1 : 8,
  label: "backend service",
  timeoutMs: 60_000,
});
