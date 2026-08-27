/**
 * `next/dynamic` mock — FOURTH preload of `test:ui:components`.
 *
 * Replaces Next.js code-splitting with SYNCHRONOUS require resolution:
 * any component tree rendered under this preload gets its dynamically
 * imported chunk from the same module registry Bun already warmed, with no
 * Suspense fallback pass and no network/turbopack involvement.
 *
 * Resolution strategy per loader passed to `dynamic(loader)`:
 * 1. SYNC-FIRST — call the loader immediately. Bundlers occasionally express
 *    dynamic targets as plain re-exports (`() => require("./X")`); those
 *    return the module object in one tick and render true content on the very
 *    first paint.
 * 2. ASYNC FALLBACK — standard arrow-`import()` loaders return a Promise.
 *    These are resolved once per loader, cached, and the memoized inner
 *    component re-renders as soon as the microtask settles. Until then the
 *    `options.loading` placeholder (or nothing) renders — mirroring what a
 *    server-rendered dynamic import looks like at hydration time.
 *
 * Test suites today render no dynamically-imported component; the mock is
 * contract infrastructure required verbatim by the `test:ui:components`
 * script signature (four exact preloads), kept honest rather than stubbed so
 * future dynamic consumers cannot silently vanish under test.
 */

import { mock } from "bun:test";
import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";

type DynamicLoader = () => unknown;

interface DynamicOptions {
  loading?: () => ReactNode | null;
  ssr?: boolean;
  loadableGenerated?: unknown;
}

/** React component types are functions or exotic objects (forwardRef/memo). */
function isComponent(value: unknown): value is ComponentType<Record<string, unknown>> {
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

interface WithDefault {
  readonly default?: unknown;
}

function hasDefaultExport(mod: unknown): mod is WithDefault {
  return typeof mod === "object" && mod !== null && "default" in mod;
}

/** Accepts a bare component or an ES module record, extracting `.default`. */
function extractComponent(mod: unknown): ComponentType<Record<string, unknown>> | null {
  if (isComponent(mod)) return mod;
  if (hasDefaultExport(mod) && isComponent(mod.default)) return mod.default;
  return null;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (typeof value !== "object" || value === null) return false;
  return "then" in value && typeof value.then === "function";
}

/** Per-loader cache: one resolution attempt regardless of re-renders. */
const resolvedModules = new Map<DynamicLoader, ComponentType<Record<string, unknown>>>();

function AsyncDynamic({
  loader,
  loading,
  ...props
}: Readonly<
  { loader: DynamicLoader; loading?: () => ReactNode | null } & Record<string, unknown>
>): ReactElement | null {
  const [Component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(
    () => resolvedModules.get(loader) ?? null
  );

  useEffect(() => {
    let alive = true;
    void Promise.resolve()
      .then(loader)
      .then(mod => {
        const extracted = alive ? extractComponent(mod) : null;
        if (alive && extracted) resolvedModules.set(loader, extracted);
        if (alive) setComponent(extracted);
        return extracted;
      });
    return () => {
      alive = false;
    };
  }, [loader]);

  // `props` is exactly the caller's prop object here — loader/loading were
  // lifted out by the destructuring above and must NOT reach the real element.
  if (Component) return createElement(Component, props);
  if (loading) return createElement(Fragment, null, loading());
  return null;
}

void mock.module("next/dynamic", () => ({
  default: (loader: DynamicLoader, options?: DynamicOptions): ComponentType<Record<string, unknown>> => {
    // Sync-first path: non-thenable results resolve without touching React state.
    let syncComponent: ComponentType<Record<string, unknown>> | null = null;
    try {
      const mod = loader();
      if (mod !== null && mod !== undefined && !isThenable(mod)) {
        syncComponent = extractComponent(mod);
        if (syncComponent) resolvedModules.set(loader, syncComponent);
      }
    } catch {
      // Loader threw synchronously (e.g. bare `require` of an ESM chunk) —
      // fall through to the async path which will surface the same failure.
    }

    const loading = options?.loading;
    if (syncComponent) {
      const Resolved = syncComponent;
      const SyncDynamic = (props: Record<string, unknown>): ReactNode => createElement(Resolved, props);
      SyncDynamic.displayName = "NextDynamicSync";
      return SyncDynamic;
    }

    const MemoizedAsyncDynamic = (props: Record<string, unknown>): ReactNode =>
      createElement(AsyncDynamic, { ...props, loader, loading });

    MemoizedAsyncDynamic.displayName = "NextDynamicMock";
    return MemoizedAsyncDynamic;
  },
}));
