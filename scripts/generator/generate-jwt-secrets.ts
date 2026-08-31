#!/usr/bin/env bun
/**
 * Generate cryptographically secure JWT secrets for environment configuration.
 *
 * Default output:
 *   JWT_SECRET=<64-byte-hex-string>
 *
 * Usage:
 *   bun run scripts/generate-jwt-secrets.ts
 *   bun run scripts/generate-jwt-secrets.ts --bytes 32 --base64
 *   bun run scripts/generate-jwt-secrets.ts --raw
 *   bun run scripts/generate-jwt-secrets.ts --write
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = process.cwd();

interface Options {
  bytes: number;
  count: number;
  format: "base64" | "hex";
  raw: boolean;
  writeEnv: boolean;
}

function printHelp(): void {
  console.log(`
JWT Secret Generator for Kottaby

Usage:
  bun run scripts/generate-jwt-secrets.ts [options]

Options:
  -b, --bytes <number>   Secret length in bytes (default: 64 bytes / 512 bits)
  -c, --count <number>   Number of secrets to generate (default: 1)
      --hex             Format output as Hexadecimal (default)
      --base64          Format output as Base64
  -r, --raw             Print raw secret value only (without JWT_SECRET= prefix)
  -w, --write           Update or append JWT_SECRET in .env, .env.local, and .env.test files
  -h, --help            Show this help message
`);
}

function parsePositiveInt(val: string | undefined): number | null {
  if (!val) {
    return null;
  }
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    bytes: 64,
    count: 1,
    format: "hex",
    raw: false,
    writeEnv: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "--bytes":
      case "-b": {
        const val = parsePositiveInt(args[i + 1]);
        if (val !== null) {
          options.bytes = val;
          i++;
        }
        break;
      }
      case "--count":
      case "-c": {
        const val = parsePositiveInt(args[i + 1]);
        if (val !== null) {
          options.count = val;
          i++;
        }
        break;
      }
      case "--hex":
        options.format = "hex";
        break;
      case "--base64":
        options.format = "base64";
        break;
      case "--raw":
      case "-r":
        options.raw = true;
        break;
      case "--write":
      case "-w":
        options.writeEnv = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
    i++;
  }

  return options;
}

function generateSecret(bytes: number, format: "base64" | "hex"): string {
  const buffer = randomBytes(bytes);
  return format === "hex" ? buffer.toString("hex") : buffer.toString("base64");
}

function updateEnvFile(filePath: string, secretKey: string, secretValue: string): boolean {
  const absPath = resolve(PROJECT_ROOT, filePath);
  if (!existsSync(absPath)) {
    return false;
  }

  const content = readFileSync(absPath, "utf8");
  const regex = new RegExp(`^${secretKey}=.*$`, "m");

  let updatedContent: string;
  if (regex.test(content)) {
    updatedContent = content.replace(regex, `${secretKey}=${secretValue}`);
  } else {
    const trailingNewline = content.endsWith("\n") ? "" : "\n";
    updatedContent = `${content}${trailingNewline}${secretKey}=${secretValue}\n`;
  }

  writeFileSync(absPath, updatedContent, "utf8");
  return true;
}

function handleWriteEnv(secrets: string[], bytes: number, format: "base64" | "hex"): void {
  const secret = secrets[0] ?? generateSecret(bytes, format);
  let updatedAny = false;

  for (const envFile of [".env", ".env.local", ".env.test"]) {
    if (updateEnvFile(envFile, "JWT_SECRET", secret)) {
      console.log(`Updated JWT_SECRET in ${envFile}`);
      updatedAny = true;
    }
  }

  if (!updatedAny) {
    console.log(`JWT_SECRET=${secret}`);
  }
}

function printSecrets(secrets: string[], raw: boolean): void {
  if (raw) {
    secrets.forEach(s => {
      console.log(s);
    });
    return;
  }

  if (secrets.length === 1) {
    console.log(`JWT_SECRET=${secrets[0]}`);
  } else {
    secrets.forEach((s, idx) => {
      console.log(`JWT_SECRET_${idx + 1}=${s}`);
    });
  }
}

export function generateJwtSecrets(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const secrets: string[] = [];
  for (let i = 0; i < options.count; i++) {
    secrets.push(generateSecret(options.bytes, options.format));
  }

  if (options.writeEnv) {
    handleWriteEnv(secrets, options.bytes, options.format);
    return;
  }

  printSecrets(secrets, options.raw);
}

if (import.meta.main) {
  generateJwtSecrets();
}
