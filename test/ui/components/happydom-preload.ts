/**
 * Happy DOM global window — SECOND preload of `test:ui:components`.
 *
 * Registers a single Happy-DOM window as the global environment ONCE per test
 * process so React Testing Library, Emotion (`document.head` style injection)
 * and MUI render against a real-ish DOM.
 *
 * Uses `@happy-dom/global-registrator` (pinned devDependency ^20.11.6). The
 * static `GlobalRegistrator.isRegistered` getter makes re-entry safe when Bun
 * executes several component test files inside one process (`--parallel=1`).
 *
 * NO network/posture knobs here on purpose:
 * - url is an inert `http://localhost` origin (nothing in these suites fetches;
 *   `LocaleSwitcher`'s click path stubs `globalThis.fetch` at test scope).
 * - Component tests are serverless — no HTTP listener of any kind is opened.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({
    url: "http://localhost/",
    width: 1024,
    height: 768,
  });
}
