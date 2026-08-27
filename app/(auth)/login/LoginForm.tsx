"use client";

import { EmailOutlined as EmailIcon, LoginOutlined as LoginIcon } from "@mui/icons-material";
import { Alert, Box, Checkbox, FormControlLabel, Link as MuiLink, Stack, TextField } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { AuthFormHeader, AuthSubmitButton, PasswordField } from "@/frontend/components/AuthFormShared";
import { useAuth } from "@/frontend/hooks/useAuth";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { isSafeRedirect } from "@/frontend/lib/safeRedirect";
import { Auth, useAppTranslation } from "@/shared/locale";

export function LoginForm() {
  const t = useAppTranslation(Auth);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login: loginContext } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // audit-R10/F2 (carried R4-F04 / R7-F2): after a failed sign-in, keep focus
  // inside the form (first field) instead of dropping it to <body>. The inline
  // role="alert" already announces; this restores a correction-ready anchor.
  const emailInputRef = useRef<HTMLInputElement>(null);
  const failSignInWith = useCallback((message: string) => {
    setErrorMessage(message);
    requestAnimationFrame(() => emailInputRef.current?.focus());
  }, []);
  const handleSubmit = useCallback(
    async (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage(null);
      setLoading(true);
      try {
        const ok = await loginContext({ email: email.trim(), password });
        if (!ok) {
          failSignInWith(t.loginError);
          return;
        }
        const redirectParam = searchParams.get("redirect");
        const target = isSafeRedirect(redirectParam) ? redirectParam : "/dashboard";
        router.push(target);
      } catch (err) {
        const code = extractErrorCode(err);
        if (code === "UNAUTHORIZED") {
          failSignInWith(t.invalidCredentials);
        } else if (code === "FORBIDDEN") {
          failSignInWith(t.accountBlocked);
        } else {
          failSignInWith(t.loginError);
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, loginContext, router, searchParams, t, failSignInWith]
  );

  return (
    <Box sx={{ width: "100%", maxWidth: { xs: 420, sm: 460 } }}>
      <AuthFormHeader icon={<LoginIcon sx={{ fontSize: 22 }} />} title={t.loginTitle} subtitle={t.loginSubtitle} />

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          <TextField
            label={t.loginEmail}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            fullWidth
            autoComplete="email"
            autoFocus
            inputRef={emailInputRef}
            slotProps={{
              input: {
                startAdornment: (
                  <EmailIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                ),
              },
            }}
          />
          <PasswordField
            label={t.loginPassword}
            value={password}
            onChange={setPassword}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword(!showPassword)}
            autoComplete="current-password"
          />

          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  size="small"
                  color="secondary"
                />
              }
              label={t.rememberMe}
              labelPlacement="end"
              sx={{
                "& .MuiFormControlLabel-label": {
                  fontSize: 14,
                  color: "var(--mui-palette-text-secondary)",
                },
              }}
            />
            <MuiLink
              component={Link}
              href="#"
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--mui-palette-secondary-main)",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {t.forgotPassword}
            </MuiLink>
          </Stack>

          {errorMessage ? (
            // audit-R7/P1: same radius token as the floating host toast that
            // can accompany this surface on masked failures.
            <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>
              {errorMessage}
            </Alert>
          ) : null}

          <AuthSubmitButton label={t.loginSubmit} loading={loading} />
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} sx={{ justifyContent: "center", mt: 3 }}>
        <MuiLink component={Link} href="/register" underline="hover" sx={{ fontWeight: 600 }}>
          {t.registerLink}
        </MuiLink>
      </Stack>
    </Box>
  );
}
