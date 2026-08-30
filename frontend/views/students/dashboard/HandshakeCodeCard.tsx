"use client";

// cspell:ignore jetbrains

import { useQuery } from "@apollo/client/react";
import { ContentCopyOutlined as ContentCopyIcon, TagOutlined as TagIcon } from "@mui/icons-material";
import { Alert, Box, Button, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode, useEffect, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import { myHandshakeCodeQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { Errors, HandshakeCode, useAppTranslation } from "@/shared/locale";

/** Lifetime of the transient copy confirmation before it self-clears. */
const COPY_CONFIRMATION_RESET_MS = 2000;

/** Copy affordance metrics — comfortable ≥44px touch target. */
const copyButtonSx = { minHeight: 44, px: 3 } as const;

/**
 * Fixed-pitch stack for the code atom. Deliberately a LITERAL stack — not
 * `var(--font-jetbrains-mono)` — because that variable is never mounted in the
 * app shell (`app/layout.tsx` loads only `--font-inter`/`--font-cairo`), so a
 * `var()` reference degrades to the INHERITED proportional font (verified via
 * browser devtools: the computed `font-family` on the chip resolves to Inter).
 * The stack prefers locally-installed JetBrains Mono and falls back through the
 * standard system monospace faces, so the code is always fixed-pitch.
 */
const MONO_FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' as const;

/** Copy-outcome state machine: idle → copied (transient) | failed (sticky). */
type CopyOutcome = "idle" | "copied" | "failed";

/**
 * HandshakeCodeCard — the student's own "Your Handshake Code" card mounted
 * above the fold on `/student/dashboard`.
 *
 * Self-contained client component: NO props, NO client-side role logic — the
 * page-level server guards remain the ONLY authorization boundary and the
 * zero-argument `myHandshakeCode` query answers identity server-side; every
 * rendered fact comes straight from the payload.
 *
 * Render branches:
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight | Skeleton card (`aria-busy`) |
 * | 2 | error code `UNAUTHORIZED` / `FORBIDDEN` | shared `PermissionDeniedFallback` — never bare `null` |
 * | 3 | error code `STUDENT_NOT_FOUND` | inline `Alert` carrying `errors.studentHandshakeNotFound` (own-row miss edge) |
 * | 4 | any other transport error | inline `Alert` carrying `errors.internalServerError` |
 * | 5 | code resolved | title + description + LTR-isolated code chip + copy affordance + `aria-live` outcome notice |
 *
 * Copy affordance: `navigator.clipboard.writeText` inside try/catch — success
 * announces the localized confirmation (self-clearing), failure announces the
 * localized fallback notice (sticky until the next attempt, instructing the
 * user to copy manually).
 *
 * MUI v9 discipline: `sx`-only styling (no direct style props), colors
 * exclusively through `theme.palette.*` callbacks, `*Outlined` icons only,
 * RTL-safe logical composition, and every user-facing string resolved through
 * compile-time i18n handles (`useAppTranslation(HandshakeCode)` property
 * access — NEVER `t('key')`).
 */
export function HandshakeCodeCard(): ReactNode {
  const t = useAppTranslation(HandshakeCode);
  const te = useAppTranslation(Errors);
  const [copyOutcome, setCopyOutcome] = useState<CopyOutcome>("idle");
  const { data, loading, error } = useQuery(myHandshakeCodeQueryDocument);

  // Transient confirmation: auto-clear the success notice so the live region
  // never keeps announcing a stale state (timer cleanup keeps unmount safe).
  useEffect(() => {
    if (copyOutcome !== "copied") {
      return undefined;
    }
    const timer = setTimeout(() => setCopyOutcome("idle"), COPY_CONFIRMATION_RESET_MS);
    return () => clearTimeout(timer);
  }, [copyOutcome]);

  // Branch 1 — in flight: skeleton placeholder announces busy semantics.
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Branches 2–4 — settled failures: denial class vs own-row miss vs generic.
  if (error) {
    const code = extractErrorCode(error);
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return <PermissionDeniedFallback />;
    }
    const failureCopy = code === "STUDENT_NOT_FOUND" ? te.studentHandshakeNotFound : te.internalServerError;
    return (
      <CardShell testId="handshake-code-card">
        <Alert severity="error" variant="outlined">
          {failureCopy}
        </Alert>
      </CardShell>
    );
  }

  const handshakeCode = data?.myHandshakeCode;

  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (typeof handshakeCode !== "string") {
    return <LoadingSkeleton />;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handshakeCode);
      setCopyOutcome("copied");
    } catch {
      // Clipboard API unavailable or denied — surface the manual-copy notice.
      setCopyOutcome("failed");
    }
  };

  // Branch 5 — the code, presented as an LTR-isolated atom with a copy CTA.
  return (
    <CardShell testId="handshake-code-card">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TagIcon fontSize="small" sx={theme => ({ color: theme.palette.primary.main })} />
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          {t.yourCodeTitle}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        {t.yourCodeDescription}
      </Typography>
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <CodeChip code={handshakeCode} />
        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={handleCopy} sx={{ ...copyButtonSx }}>
          {t.copyCode}
        </Button>
      </Stack>
      <CopyOutcomeNotice outcome={copyOutcome} copiedText={t.codeCopied} failedText={t.copyFailed} />
    </CardShell>
  );
}

interface CodeChipProps {
  /** The server-provided handshake code (canonical `KSB-XXXXXXXX` form). */
  readonly code: string;
}

/**
 * The code chip — a fixed-pitch, generously-spaced Latin atom.
 *
 * RTL note (the mechanism is load-bearing): the code MUST read left-to-right
 * inside RTL Arabic layouts. The LTR pin uses the HTML `dir="ltr"` ATTRIBUTE
 * plus `unicodeBidi: "isolate"` in `sx` — NOT a `direction: "ltr"` CSS
 * declaration — because the Arabic Emotion cache runs `stylis-plugin-rtl`
 * (cssjanus), which FLIPS author `direction: ltr` declarations to `rtl`,
 * silently inverting a CSS-side pin. The `dir` attribute is applied by the
 * user-agent stylesheet and cannot be touched by the flip; `unicode-bidi` is
 * not a directional property and passes through untouched. Same technique as
 * `frontend/providers/theme/LtrScope.tsx` ("the HTML `dir` attribute so
 * physical spacing is not flipped"), scoped to a single element.
 */
function CodeChip({ code }: Readonly<CodeChipProps>): ReactNode {
  return (
    <Box
      dir="ltr"
      data-testid="handshake-code-chip"
      sx={theme => ({
        unicodeBidi: "isolate",
        display: "inline-flex",
        alignItems: "center",
        px: 2.5,
        py: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.primaryContainer,
        color: theme.palette.onPrimaryContainer,
        width: "fit-content",
        maxWidth: "100%",
        // One tap/click selects the whole code — the manual fallback path for
        // environments where the async clipboard API is unavailable.
        userSelect: "all",
      })}
    >
      <Typography
        sx={{
          fontFamily: MONO_FONT_FAMILY,
          fontSize: { xs: "1.125rem", sm: "1.375rem" },
          fontWeight: 600,
          letterSpacing: "0.12em",
        }}
      >
        {code}
      </Typography>
    </Box>
  );
}

interface CopyOutcomeNoticeProps {
  readonly outcome: CopyOutcome;
  /** Localized success confirmation (`handshakeCode.codeCopied`). */
  readonly copiedText: string;
  /** Localized failure notice (`handshakeCode.copyFailed`). */
  readonly failedText: string;
}

/**
 * Polite live region for the copy outcome. Rendered as `<output>` (implicit
 * `role="status"` → `aria-live="polite"`, the sanctioned MUI v9 pattern) and
 * kept MOUNTED in every state so assistive tech announces the content
 * insertion; the reserved min-height prevents layout shift when copy feedback
 * appears.
 */
function CopyOutcomeNotice({ outcome, copiedText, failedText }: Readonly<CopyOutcomeNoticeProps>): ReactNode {
  const notice = resolveCopyNotice(outcome, copiedText, failedText);
  return (
    <Box component="output" sx={{ display: "block", minHeight: 20 }}>
      {notice ? (
        <Typography variant="body2" sx={theme => ({ color: notice.color(theme.palette) })}>
          {notice.text}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Resolves the copy outcome into notice copy + tone color (no nested conditionals). */
function resolveCopyNotice(
  outcome: CopyOutcome,
  copiedText: string,
  failedText: string
): { readonly text: string; readonly color: (palette: import("@mui/material/styles").Palette) => string } | null {
  switch (outcome) {
    case "copied":
      return { text: copiedText, color: palette => palette.success.main };
    case "failed":
      return { text: failedText, color: palette => palette.error.main };
    default:
      return null;
  }
}

interface CardShellProps {
  readonly children: ReactNode;
  /** Stable test hook — settled card vs skeleton branch. */
  readonly testId: string;
  /** Marks the shell as busy for assistive tech (skeleton branch). */
  readonly busy?: boolean;
}

/** Outer card shell shared by every settled branch (uniform dashboard slot). */
function CardShell({ children, testId, busy }: Readonly<CardShellProps>): ReactNode {
  return (
    <Card
      elevation={0}
      aria-busy={busy ? "true" : undefined}
      data-testid={testId}
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
        boxShadow: theme.palette.shadow.card,
      })}
    >
      <CardContent sx={{ p: { xs: 3, sm: 4 }, display: "grid", gap: 2 }}>{children}</CardContent>
    </Card>
  );
}

/** Loading skeleton — title line + code chip + copy action. */
function LoadingSkeleton(): ReactNode {
  return (
    <CardShell testId="handshake-code-card-loading" busy>
      <Skeleton variant="text" sx={{ fontSize: "1.75rem", maxWidth: 280 }} />
      <Skeleton variant="rounded" sx={{ height: 56, width: 220, borderRadius: 2 }} />
      <Skeleton variant="rectangular" sx={{ height: 44, width: 170, borderRadius: 2 }} />
    </CardShell>
  );
}
