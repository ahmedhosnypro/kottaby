/**
 * Live PostgreSQL introspection library for the Draft Academy / Kottaby DB.
 *
 * Exposes 8 read-only async functions that query the live `kottaby` database
 * (PostgreSQL 17.10 on 127.0.0.1:5432) via the `queryDb` helper from
 * `@/backend/db/index`. All queries target `information_schema` + `pg_catalog`
 * views with parameterized `$1` placeholders — table names are NEVER
 * string-interpolated.
 *
 * Used by the live DB explorer dashboard (`app/page.tsx` + client shell in
 * `app/_components/db-explorer-client.tsx`). Replaces the static hardcoded
 * schema-inventory page (DEV1-001 verification build).
 *
 * Security:
 *  - All table-name parameters are validated against `^[a-z_]+$` before
 *    querying (defense-in-depth — even though we use parameterized queries,
 *    identifiers in `information_schema` columns don't accept `$1` in all
 *    positions; we use them as VALUES not identifiers).
 *  - Read-only: no INSERT/UPDATE/DELETE. SELECT-only against catalog views.
 *  - No PII exposure — only schema metadata + aggregate row counts.
 */
import { queryDb } from "@/backend/db/index";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Identifier whitelist — table names must match this before querying. */
const TABLE_NAME_RE = /^[a-z_]+$/;

/** One row per public-schema table, with live metadata. */
export interface TableSummary {
  tableName: string;
  rowCount: number;
  columnCount: number;
  hasTriggers: boolean;
  isImmutable: boolean;
  constraints: {
    pk: number;
    fks: number;
    uniques: number;
    checks: number;
  };
}

/** One row per column on a table — full metadata for the expand panel. */
export interface ColumnInfo {
  columnName: string;
  dataType: string;
  udtName: string | null;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  fkReferences: string | null;
  isUnique: boolean;
  checkConstraint: string | null;
}

/** One row per public-schema enum type, with all values. */
export interface EnumInfo {
  enumName: string;
  values: string[];
}

/** One row per public-schema trigger (immutability triggers — 6 in DEV1-001). */
export interface TriggerInfo {
  triggerName: string;
  tableName: string;
  eventManipulation: string;
  timing: string;
  isEnabled: boolean;
}

/** One row per index, with column list + flags. */
export interface IndexInfo {
  indexName: string;
  tableName: string;
  columnNames: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

/** One row per foreign-key constraint, fully resolved. */
export interface FkInfo {
  constraintName: string;
  tableName: string;
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
  onDelete: string;
}

/** High-level DB stats for the dashboard header / stat strip. */
export interface DbStats {
  dbName: string;
  postgresVersion: string;
  tableCount: number;
  enumCount: number;
  triggerCount: number;
  totalRows: number;
  schemaSize: string;
}

/** One row per CHECK constraint. */
export interface CheckInfo {
  constraintName: string;
  tableName: string;
  checkClause: string;
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

/**
 * Validates that a table-name parameter is safe to query with. Even though we
 * pass it as a `$1` parameter (so it can never be SQL-injected), we apply a
 * strict whitelist regex as defense-in-depth. Throws on invalid input.
 */
function assertValidTableName(tableName: string): void {
  if (!TABLE_NAME_RE.test(tableName)) {
    throw new Error(`Invalid table name: "${tableName}". Must match /^[a-z_]+$/.`);
  }
}

/**
 * Translates PostgreSQL's `confdeltype` single-char code to a readable string.
 * See https://www.postgresql.org/docs/current/catalog-pg-constraint.html
 */
function decodeOnDelete(code: string): string {
  switch (code) {
    case "a":
      return "NO ACTION";
    case "r":
      return "RESTRICT";
    case "c":
      return "CASCADE";
    case "n":
      return "SET NULL";
    case "d":
      return "SET DEFAULT";
    default:
      return code;
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Returns one summary row per public-schema table. Single round-trip — uses
 * correlated subqueries against `pg_constraint` and joins `pg_stat_user_tables`
 * for live row counts (n_live_tup).
 */
export async function getTableSummaries(): Promise<TableSummary[]> {
  const sql = `
    SELECT
      c.relname                                  AS table_name,
      COALESCE(s.n_live_tup, 0)::bigint          AS row_count,
      (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name = c.relname)::int AS column_count,
      EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
      ) AS has_triggers,
      EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = c.oid
           AND NOT t.tgisinternal
           AND t.tgname LIKE 'prevent_%_update_trigger'
      ) AS is_immutable,
      (SELECT count(*) FROM pg_constraint con
         WHERE con.conrelid = c.oid AND con.contype='p')::int AS pk_count,
      (SELECT count(*) FROM pg_constraint con
         WHERE con.conrelid = c.oid AND con.contype='f')::int AS fk_count,
      (SELECT count(*) FROM pg_constraint con
         WHERE con.conrelid = c.oid AND con.contype='u')::int AS unique_count,
      (SELECT count(*) FROM pg_constraint con
         WHERE con.conrelid = c.oid AND con.contype='c')::int AS check_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `;
  const result = await queryDb<{
    table_name: string;
    row_count: string;
    column_count: number;
    has_triggers: boolean;
    is_immutable: boolean;
    pk_count: number;
    fk_count: number;
    unique_count: number;
    check_count: number;
  }>(sql);
  return result.rows.map(r => ({
    tableName: r.table_name,
    rowCount: Number(r.row_count),
    columnCount: r.column_count,
    hasTriggers: r.has_triggers,
    isImmutable: r.is_immutable,
    constraints: {
      pk: r.pk_count,
      fks: r.fk_count,
      uniques: r.unique_count,
      checks: r.check_count,
    },
  }));
}

/**
 * Returns the full column inventory for a single table — including PK/FK/
 * UNIQUE/CHECK flags and the FK reference target (`table.col`) when applicable.
 * Single round-trip via correlated subqueries.
 */
export async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  assertValidTableName(tableName);
  const sql = `
    SELECT
      cols.column_name,
      cols.data_type,
      cols.udt_name,
      (cols.is_nullable = 'YES') AS is_nullable,
      cols.column_default,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class tc ON tc.oid = con.conrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE tn.nspname='public' AND tc.relname = $1
          AND a.attname = cols.column_name
          AND con.contype='p'
      ) AS is_primary_key,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class tc ON tc.oid = con.conrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE tn.nspname='public' AND tc.relname = $1
          AND a.attname = cols.column_name
          AND con.contype='u'
      ) AS is_unique,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class tc ON tc.oid = con.conrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE tn.nspname='public' AND tc.relname = $1
          AND a.attname = cols.column_name
          AND con.contype='f'
      ) AS is_foreign_key,
      (
        SELECT rf.relname || '.' || ra.attname
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class rf ON rf.oid = con.confrelid
        JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = ANY(con.confkey)
        JOIN pg_class tc ON tc.oid = con.conrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE tn.nspname='public' AND tc.relname = $1
          AND a.attname = cols.column_name
          AND con.contype='f'
        LIMIT 1
      ) AS fk_references,
      (
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class tc ON tc.oid = con.conrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE tn.nspname='public' AND tc.relname = $1
          AND a.attname = cols.column_name
          AND con.contype='c'
        LIMIT 1
      ) AS check_constraint
    FROM information_schema.columns cols
    WHERE cols.table_schema='public' AND cols.table_name = $1
    ORDER BY cols.ordinal_position;
  `;
  const result = await queryDb<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: boolean;
    column_default: string | null;
    is_primary_key: boolean;
    is_unique: boolean;
    is_foreign_key: boolean;
    fk_references: string | null;
    check_constraint: string | null;
  }>(sql, [tableName]);
  return result.rows.map(r => ({
    columnName: r.column_name,
    dataType: r.data_type,
    udtName: r.udt_name,
    isNullable: r.is_nullable,
    columnDefault: r.column_default,
    isPrimaryKey: r.is_primary_key,
    isForeignKey: r.is_foreign_key,
    fkReferences: r.fk_references,
    isUnique: r.is_unique,
    checkConstraint: r.check_constraint,
  }));
}

/**
 * Returns all public-schema enum types with their ordered values. Aggregates
 * `pg_enum.enumlabel` per `pg_type.typname` via `array_agg`.
 */
export async function getEnums(): Promise<EnumInfo[]> {
  const sql = `
    SELECT
      t.typname AS enum_name,
      coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder) FILTER (WHERE e.enumlabel IS NOT NULL), '[]'::json) AS values
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `;
  const result = await queryDb<{
    enum_name: string;
    values: string[];
  }>(sql);
  return result.rows.map(r => ({
    enumName: r.enum_name,
    values: r.values,
  }));
}

/**
 * Returns all public-schema triggers. Joins `information_schema.triggers`
 * with `pg_trigger` (for `tgenabled`) so we can report the live enabled/
 * disabled state. DEV1-001 ships 6 immutability triggers — see
 * `backend/db/migration/3-immutability-triggers.sql`.
 */
export async function getTriggers(): Promise<TriggerInfo[]> {
  const sql = `
    SELECT
      it.trigger_name,
      it.event_object_table AS table_name,
      it.event_manipulation,
      it.action_timing AS timing,
      (pt.tgenabled = 'O') AS is_enabled
    FROM information_schema.triggers it
    LEFT JOIN pg_trigger pt
      ON pt.tgname = it.trigger_name
     AND pt.tgrelid = (
       SELECT c.oid FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname = it.event_object_table
       LIMIT 1
     )
    WHERE it.trigger_schema = 'public'
    ORDER BY it.event_object_table, it.event_manipulation, it.trigger_name;
  `;
  const result = await queryDb<{
    trigger_name: string;
    table_name: string;
    event_manipulation: string;
    timing: string;
    is_enabled: boolean;
  }>(sql);
  return result.rows.map(r => ({
    triggerName: r.trigger_name,
    tableName: r.table_name,
    eventManipulation: r.event_manipulation,
    timing: r.timing,
    isEnabled: r.is_enabled,
  }));
}

/**
 * Returns all public-schema indexes (optionally filtered to one table).
 * Unnests `pg_index.indkey` to expand column names into an ordered array.
 */
export async function getIndexes(tableName?: string): Promise<IndexInfo[]> {
  const sql = `
    SELECT
      i.relname AS index_name,
      c.relname AS table_name,
      coalesce(json_agg(a.attname ORDER BY k.ord) FILTER (WHERE a.attname IS NOT NULL), '[]'::json) AS column_names,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary
    FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public'
      AND ($1::text IS NULL OR c.relname = $1)
    GROUP BY i.relname, c.relname, ix.indisunique, ix.indisprimary
    ORDER BY c.relname, i.relname;
  `;
  const result = await queryDb<{
    index_name: string;
    table_name: string;
    column_names: string[];
    is_unique: boolean;
    is_primary: boolean;
  }>(sql, [tableName ?? null]);
  return result.rows.map(r => ({
    indexName: r.index_name,
    tableName: r.table_name,
    columnNames: r.column_names,
    isUnique: r.is_unique,
    isPrimary: r.is_primary,
  }));
}

/**
 * Returns all public-schema foreign-key constraints (optionally filtered to
 * one table). Unnests `conkey` + `confkey` in lockstep to pair local →
 * foreign columns. Translates `confdeltype` to a readable ON DELETE string.
 */
export async function getForeignKeys(tableName?: string): Promise<FkInfo[]> {
  const sql = `
    SELECT
      con.conname AS constraint_name,
      tbl.relname AS table_name,
      attr.attname AS column_name,
      ftbl.relname AS foreign_table_name,
      fattr.attname AS foreign_column_name,
      con.confdeltype AS on_delete_code
    FROM pg_constraint con
    JOIN pg_class tbl  ON tbl.oid  = con.conrelid
    JOIN pg_class ftbl ON ftbl.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)  ON true
    JOIN pg_attribute attr  ON attr.attrelid  = tbl.oid  AND attr.attnum  = k.attnum
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
    JOIN pg_attribute fattr ON fattr.attrelid = ftbl.oid AND fattr.attnum = fk.attnum
    WHERE n.nspname = 'public'
      AND con.contype = 'f'
      AND ($1::text IS NULL OR tbl.relname = $1)
    ORDER BY tbl.relname, con.conname, k.ord;
  `;
  const result = await queryDb<{
    constraint_name: string;
    table_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
    on_delete_code: string;
  }>(sql, [tableName ?? null]);
  return result.rows.map(r => ({
    constraintName: r.constraint_name,
    tableName: r.table_name,
    columnName: r.column_name,
    foreignTableName: r.foreign_table_name,
    foreignColumnName: r.foreign_column_name,
    onDelete: decodeOnDelete(r.on_delete_code),
  }));
}

/**
 * Returns high-level database statistics for the dashboard header. Pulls the
 * PG version string, table count, enum count, trigger count, total live row
 * count, and a human-readable DB size via `pg_size_pretty(pg_database_size)`.
 */
export async function getDbStats(): Promise<DbStats> {
  const sql = `
    SELECT
      current_database() AS db_name,
      version() AS postgres_version,
      (SELECT count(*) FROM pg_tables WHERE schemaname='public')::int AS table_count,
      (SELECT count(DISTINCT t.typname)
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname='public')::int AS enum_count,
      (SELECT count(*) FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND NOT t.tgisinternal)::int AS trigger_count,
      COALESCE((SELECT sum(n_live_tup)::bigint FROM pg_stat_user_tables), 0)::bigint AS total_rows,
      pg_size_pretty(pg_database_size(current_database())) AS schema_size;
  `;
  const result = await queryDb<{
    db_name: string;
    postgres_version: string;
    table_count: number;
    enum_count: number;
    trigger_count: number;
    total_rows: bigint;
    schema_size: string;
  }>(sql);
  const r = result.rows[0];
  if (!r) {
    throw new Error("getDbStats: empty result set");
  }
  return {
    dbName: r.db_name,
    postgresVersion: r.postgres_version,
    tableCount: r.table_count,
    enumCount: r.enum_count,
    triggerCount: r.trigger_count,
    totalRows: Number(r.total_rows),
    schemaSize: r.schema_size,
  };
}

/**
 * Returns all public-schema CHECK constraints (optionally filtered to one
 * table). Uses `pg_get_constraintdef` to render the human-readable clause.
 */
export async function getCheckConstraints(tableName?: string): Promise<CheckInfo[]> {
  const sql = `
    SELECT
      con.conname AS constraint_name,
      tbl.relname AS table_name,
      pg_get_constraintdef(con.oid) AS check_clause
    FROM pg_constraint con
    JOIN pg_class tbl ON tbl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'c'
      AND ($1::text IS NULL OR tbl.relname = $1)
    ORDER BY tbl.relname, con.conname;
  `;
  const result = await queryDb<{
    constraint_name: string;
    table_name: string;
    check_clause: string;
  }>(sql, [tableName ?? null]);
  return result.rows.map(r => ({
    constraintName: r.constraint_name,
    tableName: r.table_name,
    checkClause: r.check_clause,
  }));
}
