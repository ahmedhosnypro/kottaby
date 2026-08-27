/**
 * Shared Test Runner UI & Formatting Helpers
 *
 * Consolidates duplicate progress bar rendering, line deduplication,
 * and ANSI escape code stripping across test runners.
 */

export function stripAnsiCodes(str: string): string {
  const ESC = String.fromCharCode(27);
  return str
    .split(ESC)
    .map(part => part.replace(/^\[[0-9;]*m/, ""))
    .join("");
}

export function deduplicateLines(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const result: string[] = [];
  let currentLine = "";
  let currentCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === currentLine && line.length > 0) {
      currentCount++;
    } else {
      if (currentCount > 1) {
        result.push(`  \x1b[90m⤷ (repeated ${currentCount - 1} more times)\x1b[0m`);
      }
      currentLine = line;
      currentCount = 1;
      result.push(line);
    }
  }

  if (currentCount > 1) {
    result.push(`  \x1b[90m⤷ (repeated ${currentCount - 1} more times)\x1b[0m`);
  }

  return result.join("\n");
}

export function renderProgressBar(current: number, total: number, width = 16): string {
  if (total <= 0) return "\x1b[90m[────────────────]\x1b[0m";
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `\x1b[36m[${bar}]\x1b[0m \x1b[1m${percent}%\x1b[0m \x1b[90m(${current}/${total} files)\x1b[0m`;
}
