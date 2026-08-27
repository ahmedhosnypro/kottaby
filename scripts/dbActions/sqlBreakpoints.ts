/**
 * Insert drizzle statement breakpoints so multi-statement custom SQL migrates correctly.
 * Skips semicolons inside PostgreSQL dollar-quoted bodies.
 */

type SqlState = "code" | "line_comment" | "block_comment" | "dollar" | "single" | "double";

interface ParseContext {
  source: string;
  result: string;
  i: number;
  state: SqlState;
  dollarTag: string;
}

/** Process one character in the "code" state — handles transitions and semicolon breakpoints. */
function processCode(ctx: ParseContext): void {
  const ch = ctx.source[ctx.i];
  const nxt = ctx.i + 1 < ctx.source.length ? ctx.source[ctx.i + 1] : "";

  if (ch === "-" && nxt === "-") {
    ctx.state = "line_comment";
    ctx.result += ch;
    ctx.i += 1;
    return;
  }
  if (ch === "/" && nxt === "*") {
    ctx.state = "block_comment";
    ctx.result += ch;
    ctx.i += 1;
    return;
  }
  if (ch === "'") {
    ctx.state = "single";
    ctx.result += ch;
    ctx.i += 1;
    return;
  }
  if (ch === '"') {
    ctx.state = "double";
    ctx.result += ch;
    ctx.i += 1;
    return;
  }
  const dollarMatch = /^\$([A-Za-z_]*)\$/.exec(ctx.source.slice(ctx.i));
  if (dollarMatch) {
    ctx.state = "dollar";
    ctx.dollarTag = dollarMatch[0];
    ctx.result += ctx.dollarTag;
    ctx.i += ctx.dollarTag.length;
    return;
  }
  ctx.result += ch;
  if (ch === ";") {
    ctx.result += "\n--> statement-breakpoint";
  }
  ctx.i += 1;
}

/** Process one character in the "line_comment" state — ends at newline. */
function processLineComment(ctx: ParseContext): void {
  const ch = ctx.source[ctx.i];
  ctx.result += ch;
  if (ch === "\n") {
    ctx.state = "code";
  }
  ctx.i += 1;
}

/**
 * Shared helper for states where we copy characters verbatim until a delimiter
 * sequence is found. Handles two patterns:
 * - "close sequence": a two-character end marker (e.g. star-slash in block comments)
 * - "escape or close": a single-character delimiter where the delimiter
 *   doubled is an escape (e.g. single-quote in strings, double-quote in identifiers)
 *
 * @param closeSeq  The two-char end marker for "close sequence" mode, or null.
 * @param delimiter The single-char delimiter for "escape or close" mode, or null.
 */
function processQuotedState(ctx: ParseContext, closeSeq: string | null, delimiter: string | null): void {
  const ch = ctx.source[ctx.i];
  const nxt = ctx.i + 1 < ctx.source.length ? ctx.source[ctx.i + 1] : "";
  ctx.result += ch;

  if (closeSeq !== null && ch === closeSeq[0] && nxt === closeSeq[1]) {
    ctx.result += nxt;
    ctx.i += 2;
    ctx.state = "code";
    return;
  }

  if (delimiter !== null && ch === delimiter && nxt === delimiter) {
    ctx.result += nxt;
    ctx.i += 2;
    return;
  }

  if (delimiter !== null && ch === delimiter) {
    ctx.state = "code";
  }

  ctx.i += 1;
}

/** Process one character in the "block_comment" state — ends at star-slash. */
function processBlockComment(ctx: ParseContext): void {
  processQuotedState(ctx, "*/", null);
}

/** Process one character in the "single" (single-quoted string) state. */
function processSingleQuote(ctx: ParseContext): void {
  processQuotedState(ctx, null, "'");
}

/** Process one character in the "double" (double-quoted identifier) state. */
function processDoubleQuote(ctx: ParseContext): void {
  processQuotedState(ctx, null, '"');
}

/** Process the dollar-quoted body — scans to the closing tag. Returns true if loop should break. */
function processDollarQuote(ctx: ParseContext): boolean {
  const end = ctx.source.indexOf(ctx.dollarTag, ctx.i);
  if (end === -1) {
    ctx.result += ctx.source.slice(ctx.i);
    return true;
  }
  ctx.result += ctx.source.slice(ctx.i, end + ctx.dollarTag.length);
  ctx.i = end + ctx.dollarTag.length;
  ctx.state = "code";
  ctx.dollarTag = "";
  return false;
}

export function withStatementBreakpoints(sql: string): string {
  const source = sql.replaceAll("--> statement-breakpoint\n", "").replaceAll("--> statement-breakpoint", "");

  const ctx: ParseContext = { source, result: "", i: 0, state: "code", dollarTag: "" };

  while (ctx.i < source.length) {
    switch (ctx.state) {
      case "code":
        processCode(ctx);
        break;
      case "line_comment":
        processLineComment(ctx);
        break;
      case "block_comment":
        processBlockComment(ctx);
        break;
      case "single":
        processSingleQuote(ctx);
        break;
      case "double":
        processDoubleQuote(ctx);
        break;
      case "dollar":
        if (processDollarQuote(ctx)) {
          break;
        }
        break;
    }
  }

  return ctx.result.replace(/(--> statement-breakpoint\n?)+/g, "--> statement-breakpoint\n");
}
