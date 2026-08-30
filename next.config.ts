import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets parallel servers use separate dist dirs — Next.js 16
  // locks the dist dir (`<distDir>/lock`) at `next dev` startup, so a test
  // server (`.next-test-dev`/`.next-test-prod`) must not share the dev
  // server's dist dir or it refuses to start ("Another next dev server is
  // already running"). All test/build scripts already export NEXT_DIST_DIR;
  // plain `bun run dev` keeps the default `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["*.space-z.ai", "*.space-zai"],
  experimental: {
    // TypeScript 7.0.2's `lib/tsc.js` is an ESM module that cannot be loaded
    // by Next.js's runTypeScriptCli (which uses require/child_process).
    // Setting `useTypeScriptCli: false` makes Next.js use the `lib/typescript.js`
    // API path instead, which works correctly with the TS6 shim installed by
    // @typescript/typescript6. This fixes the "Could not parse output from
    // TypeScript's --showConfig" error in Storybook.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
