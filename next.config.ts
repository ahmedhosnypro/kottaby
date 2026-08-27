import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
