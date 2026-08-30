"use client";

import { skipToken, useQuery } from "@apollo/client/react";
import { SearchOffOutlined as SearchOffIcon } from "@mui/icons-material";
import { Alert, Box, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type { FindStudentByHandshakeCodeQuery_findStudentByHandshakeCode } from "@/frontend/graphql/generated/gql/graphql";
import { findStudentByHandshakeCodeQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { HandshakeCodeResultCard } from "@/frontend/views/parent/handshake/HandshakeCodeResultCard";
import { HandshakeCodeSearchForm } from "@/frontend/views/parent/handshake/HandshakeCodeSearchForm";
import { isHandshakeCode, normalizeHandshakeCode } from "@/shared/constants";
import { Errors, HandshakeCode, useAppTranslation } from "@/shared/locale";

/**
 * HandshakeDiscoveryContainer — the client heart of `/parent/handshake`.
 *
 * A parent submits a student's handshake code; the code is normalized and
 * validated CLIENT-side through the shared canonical gate
 * (`normalizeHandshakeCode` + `isHandshakeCode`), and only a VALID code ever
 * reaches the `validatedCode` state that gates the query — the stateful
 * `useQuery` receives `skipToken` until a code validates, which is the
 * zero-network proof for malformed input (no `useLazyQuery` anywhere).
 * Editing the field clears `validatedCode`, so a stale result never lingers
 * beside fresh input; resubmitting the UNCHANGED code forces a `refetch`,
 * so a retry after a generic error always re-queries instead of persisting
 * the stale error. The query runs `fetchPolicy: "network-only"` (see the
 * comment at the `useQuery` call).
 *
 * Outcome state machine (derived per render — no stored result state):
 *
 * | # | Condition | Result region |
 * |---|-----------|---------------|
 * | 1 | `validatedCode` unset | nothing (idle — the page description above the form is the empty state) |
 * | 2 | query error `UNAUTHORIZED`/`FORBIDDEN` | shared `PermissionDeniedFallback` replaces the whole container (never bare `null`) |
 * | 3 | query error `VALIDATION` (server-side re-judgment) | nothing here — the error surfaces INLINE on the field with the same format-teaching copy as the client gate |
 * | 4 | any other query error | inline `Alert` carrying `errors.internalServerError` (form stays retryable) |
 * | 5 | query in flight | result-region skeleton (`aria-busy`) |
 * | 6 | resolved `null` | neutral inline not-found state — deliberately NOT error styling (a miss is a first-class UI state, indistinguishable for every miss reason) |
 * | 7 | resolved payload | masked-name result card; `linkable`-driven copy, NO link-request CTA (deferred to the link-request feature) |
 *
 * MUI v9 discipline: `sx`-only styling, colors through theme-palette
 * callbacks, `*Outlined` icons, logical properties for RTL mirroring; every
 * user-facing string resolves through the compile-time `HandshakeCode` /
 * `Errors` namespace handles (property access only).
 */
export function HandshakeDiscoveryContainer(props: Readonly<HandshakeDiscoveryContainerProps>): ReactNode {
  const t = useAppTranslation(HandshakeCode);
  const te = useAppTranslation(Errors);
  const [codeInput, setCodeInput] = useState("");
  const [validatedCode, setValidatedCode] = useState<string | null>(null);
  const [formatError, setFormatError] = useState(false);

  const { data, error, loading, refetch } = useQuery(
    findStudentByHandshakeCodeQueryDocument,
    // `network-only`: discovery is a POINT-IN-TIME lookup — the student's
    // linkage state can change between searches (another parent may link
    // them at any moment), so the cache has no value here. Without this, an
    // edit → re-enter-the-SAME-code → resubmit cycle would re-activate the
    // query and cache-first would replay the stale `maskedName`/`linkable`
    // without a network round-trip. The skip gate stays the sole authority
    // over whether a query exists at all; `network-only` only governs how an
    // activated query resolves (always over the wire; results still write
    // back through the normal cache policies).
    validatedCode === null ? skipToken : { fetchPolicy: "network-only", variables: { code: validatedCode } }
  );

  const errorCode = error === undefined ? null : extractErrorCode(error);
  // The server re-judges the code shape (`VALIDATION`) — surfaced at the field
  // with the same format-teaching copy as the client gate. Fully derived (no
  // effect needed): the flag clears itself the moment a new search replaces
  // the rejected operation.
  const serverValidationError = errorCode === "VALIDATION";

  // Denial class — replaces the whole container, mirroring the denial-surface
  // precedent on the sibling student handshake-code card.
  if (errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN") {
    return <PermissionDeniedFallback />;
  }

  const handleCodeInputChange = (value: string) => {
    setCodeInput(value);
    setFormatError(false);
    // A fresh edit invalidates the previous search — the result region
    // returns to idle (the skip gate keeps this transition network-free).
    setValidatedCode(null);
  };

  const handleSubmit = () => {
    const normalized = normalizeAndValidate(codeInput);
    if (normalized === null) {
      setFormatError(true);
      return;
    }
    setFormatError(false);
    // Resubmitting the UNCHANGED code (the retry path after a generic error
    // leaves the field untouched): `validatedCode` already holds this exact
    // value, so re-setting it is a no-op state update the query never sees —
    // the stale error would persist forever. Force the retry through
    // `refetch` instead (still no `useLazyQuery`; the skip gate remains the
    // only authority over when a query exists at all).
    if (normalized === validatedCode) {
      void refetch({ code: normalized });
      return;
    }
    setValidatedCode(normalized);
  };

  return (
    <Stack spacing={3} sx={{ width: "100%", maxWidth: 640, mx: "auto" }}>
      <Box component="header">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {props.pageTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {props.pageDescription}
        </Typography>
      </Box>
      <HandshakeCodeSearchForm
        codeInput={codeInput}
        error={formatError || serverValidationError}
        onCodeInputChange={handleCodeInputChange}
        onSubmit={handleSubmit}
      />
      <ResultRegion
        state={deriveResultState({ validatedCode, loading, error, data })}
        genericErrorCopy={te.internalServerError}
        notFoundTitle={t.notFoundTitle}
        notFoundDescription={t.notFoundDescription}
      />
    </Stack>
  );
}

/** Shell labels for the static page header — server-translated props. */
interface HandshakeDiscoveryContainerProps {
  /** Discovery page heading (`handshakeCode.pageTitle`). */
  readonly pageTitle: string;
  /** Discovery page intro copy (`handshakeCode.pageDescription`). */
  readonly pageDescription: string;
}

/** The derived outcome of the gated query — exactly one kind per render. */
type HandshakeResultState =
  | { readonly kind: "idle" }
  | { readonly kind: "validation" }
  | { readonly kind: "generic-error" }
  | { readonly kind: "searching" }
  | { readonly kind: "not-found" }
  | { readonly kind: "found"; readonly maskedName: string; readonly linkable: boolean };

interface DeriveResultStateInputs {
  readonly validatedCode: string | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly data:
    | { readonly findStudentByHandshakeCode: FindStudentByHandshakeCodeQuery_findStudentByHandshakeCode | null }
    | undefined;
}

/**
 * Pure derivation of the outcome state — error states outrank data states,
 * and every settled miss (unknown code, governance-excluded student) lands
 * on the SAME not-found channel.
 */
function deriveResultState(inputs: Readonly<DeriveResultStateInputs>): HandshakeResultState {
  if (inputs.validatedCode === null) {
    return { kind: "idle" };
  }
  if (inputs.error !== undefined) {
    return extractErrorCode(inputs.error) === "VALIDATION" ? { kind: "validation" } : { kind: "generic-error" };
  }
  if (inputs.loading) {
    return { kind: "searching" };
  }
  const lookup = inputs.data?.findStudentByHandshakeCode;
  if (lookup == null) {
    return { kind: "not-found" };
  }
  return { kind: "found", maskedName: lookup.maskedName, linkable: lookup.linkable };
}

/**
 * Canonical client gate: normalize first (trim + uppercase), then validate
 * against the shared shape guard. Returns the normalized code, or `null`
 * when the input can never be a handshake code.
 */
function normalizeAndValidate(raw: string): string | null {
  const normalized = normalizeHandshakeCode(raw);
  return isHandshakeCode(normalized) ? normalized : null;
}

interface ResultRegionProps {
  readonly state: HandshakeResultState;
  /** Localized generic failure copy (`errors.internalServerError`). */
  readonly genericErrorCopy: string;
  /** Localized neutral not-found heading. */
  readonly notFoundTitle: string;
  /** Localized neutral not-found body. */
  readonly notFoundDescription: string;
}

/**
 * The result region below the form — renders exactly one outcome state per
 * the state machine (nothing at all while idle, and nothing beyond the field
 * error while the server re-judges the format).
 */
function ResultRegion(props: Readonly<ResultRegionProps>): ReactNode {
  switch (props.state.kind) {
    case "found":
      return <HandshakeCodeResultCard maskedName={props.state.maskedName} linkable={props.state.linkable} />;
    case "searching":
      return <SearchingSkeleton />;
    case "not-found":
      return <NotFoundState title={props.notFoundTitle} description={props.notFoundDescription} />;
    case "generic-error":
      return (
        <Alert severity="error" variant="outlined">
          {props.genericErrorCopy}
        </Alert>
      );
    default:
      return null;
  }
}

/** Searching state — result-region skeleton (mirrors the card skeleton rhythm). */
function SearchingSkeleton(): ReactNode {
  return (
    <Card
      elevation={0}
      aria-busy="true"
      data-testid="handshake-discovery-searching"
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <CardContent sx={{ p: { xs: 3, sm: 4 }, display: "grid", gap: 2 }}>
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", maxWidth: 260 }} />
        <Skeleton variant="rounded" sx={{ height: 48, maxWidth: 220, borderRadius: 2 }} />
        <Skeleton variant="text" sx={{ maxWidth: 380 }} />
      </CardContent>
    </Card>
  );
}

interface NotFoundStateProps {
  readonly title: string;
  readonly description: string;
}

/**
 * Not-found state — a NEUTRAL inline surface (a discovery miss is a
 * first-class UI state, not a failure): NO `Alert`, no error palette, no
 * alert semantics — palette-neutral card tokens with secondary text.
 */
function NotFoundState({ title, description }: Readonly<NotFoundStateProps>): ReactNode {
  return (
    <Card
      elevation={0}
      data-testid="handshake-discovery-not-found"
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <CardContent sx={{ p: { xs: 3, sm: 4 }, display: "grid", gap: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <SearchOffIcon fontSize="small" sx={theme => ({ color: theme.palette.text.secondary })} />
          <Typography variant="h6" component="h3" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}
