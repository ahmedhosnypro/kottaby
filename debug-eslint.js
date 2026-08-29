#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Debug script to see which ESLint plugins and rules are active
 */
import { ESLint } from "eslint";

async function debugESLint() {
  const eslint = new ESLint();

  // Get config for a TypeScript file
  const config = await eslint.calculateConfigForFile("eslint.config.ts");

  console.log("\n=== ACTIVE PLUGINS ===");
  console.log(Object.keys(config.plugins || {}));

  console.log("\n=== PARSER ===");
  console.log(config.parser);

  console.log("\n=== PARSER OPTIONS ===");
  console.log(JSON.stringify(config.parserOptions, null, 2));

  console.log("\n=== ACTIVE RULES (non-off) ===");
  const activeRules = Object.entries(config.rules || {})
    .filter(([_, value]) => {
      const level = Array.isArray(value) ? value[0] : value;
      return level !== "off" && level !== 0;
    })
    .map(([name]) => name);

  activeRules.sort((a, b) => a.localeCompare(b));
  console.log(activeRules.join("\n"));

  console.log("\n=== TYPE-AWARE RULES (if any) ===");
  const typeAwareRules = activeRules.filter(
    rule =>
      rule.includes("type-") ||
      rule.includes("await") ||
      rule.includes("promise") ||
      rule.includes("no-floating-promises") ||
      rule.includes("no-misused-promises") ||
      rule.includes("require-await")
  );
  console.log(typeAwareRules.length > 0 ? typeAwareRules.join("\n") : "None found");
}

debugESLint().catch(console.error);
