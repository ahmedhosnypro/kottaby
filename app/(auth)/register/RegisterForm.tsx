"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import {
  CheckCircleOutlined as CheckCircleIcon,
  EmailOutlined as EmailIcon,
  LockOutlined as LockIcon,
  PersonAddOutlined as PersonAddIcon,
  PersonOutlined as PersonIcon,
  PhoneOutlined as PhoneIcon,
  PublicOutlined as PublicIcon,
  VisibilityOutlined as VisibilityIcon,
  VisibilityOffOutlined as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  MenuItem,
  IconButton as MuiIconButton,
  Link as MuiLink,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { RecitationSelector } from "@/app/(auth)/register/RecitationSelector";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { Gender, type RecitationReading, RegisterPublicRole } from "@/frontend/graphql/generated/gql/graphql";
import { registerUserMutationDocument } from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { recitationReadingsQueryDocument } from "@/frontend/graphql/sharedDocuments/auth/recitation.documents";
import { extractErrorCode, extractErrorMessage } from "@/frontend/lib/graphql-error-utils";
import { applyProjectedFieldErrors, projectMutationFieldErrors } from "@/frontend/lib/mutationFieldErrors";
import { Auth, Recitation, useAppTranslation } from "@/shared/locale";
import type { AuthLabels } from "@/shared/locale/types/auth";

/** Minimum password length (REQ-041) — mirrors `registration.service.ts`. */
const MIN_PASSWORD_LENGTH = 8;

/** audit-R7/P1+P2: shared helper-text treatment for the manual helper nodes
 * (consistent rhythm across loading/error/idle states and roomier line boxes
 * for multi-line Arabic copy). */
const helperTextSx = { lineHeight: 1.6 };

/** audit-R7/P1: honor prefers-reduced-motion for the submit CTA motion.
 * Expressed as an embedded media query so it holds even before hydration
 * (equivalent to the useMediaQuery({ noSsr:true }) convention, minus the
 * hydration-timing risk). */
const reducedMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    transition: "none",
    "&:hover": {
      transform: "none",
    },
  },
};

/**
 * Two-step email SHAPE pre-check, mirroring `isValidEmail`
 * (`backend/services/auth/registration.service.ts`) including its rationale:
 * split on `@` instead of a nested-quantifier regex to avoid super-linear
 * backtracking. The server VALIDATION row stays authoritative either way.
 */
function isValidEmailShape(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  const atIdx = email.indexOf("@");
  if (atIdx < 1) return false;
  if (atIdx !== email.lastIndexOf("@")) return false; // exactly one `@`
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (domain.length < 3) return false; // need at least "x.y"
  const dotIdx = domain.indexOf(".");
  if (dotIdx < 1 || dotIdx === domain.length - 1) return false;
  // No whitespace anywhere (covers `\s` without a complex regex).
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  return true;
}

/**
 * Field paths the server may address in `extensions.fields[]` pairs
 * (REQ-015). Whitelist-guarded before any pair reaches RHF `setError` —
 * unknown/spoofed wire paths are dropped instead of force-cast into form
 * state. KEEP IN SYNC with {@link RegisterFormValues}.
 */
const REGISTER_FIELD_PATHS = [
  "fullName",
  "email",
  "phone",
  "password",
  "country",
  "gender",
  "role",
  "preferredRecitation",
] as const;

type RegisterFieldPath = (typeof REGISTER_FIELD_PATHS)[number];

/** Assertion-free narrowing guard over the registration form's field paths. */
function isRegisterFieldPath(value: string): value is RegisterFieldPath {
  return REGISTER_FIELD_PATHS.some(path => path === value);
}

/**
 * Local string-keyed lookup tables for the form's select fields. RHF
 * path-generic VALUE inference degrades GraphQL enum unions to bare
 * `string` under this repo's type checker (tsgo), and raw enum-vs-string
 * comparison is barred (`no-unsafe-enum-comparison`) — so wire/field strings
 * are pinned back through these `Record<string, Enum>` maps instead.
 */
const GENDER_BY_SELECT_VALUE: Readonly<Record<string, Gender>> = {
  [Gender.Male]: Gender.Male,
  [Gender.Female]: Gender.Female,
  [Gender.Other]: Gender.Other,
};

/** Pins a raw select value back to {@link Gender} (else `null`). */
function genderFromSelectValue(rawValue: string): Gender | null {
  return GENDER_BY_SELECT_VALUE[rawValue] ?? null;
}

const ROLE_BY_SELECT_VALUE: Readonly<Record<string, RegisterPublicRole>> = {
  [RegisterPublicRole.Student]: RegisterPublicRole.Student,
  [RegisterPublicRole.Teacher]: RegisterPublicRole.Teacher,
  [RegisterPublicRole.Parent]: RegisterPublicRole.Parent,
};

/** Pins a raw select value back to {@link RegisterPublicRole} (else `""`). */
function roleFromSelectValue(rawValue: string): RegisterPublicRole | "" {
  return ROLE_BY_SELECT_VALUE[rawValue] ?? "";
}

interface RegisterFormValues {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  country: string;
  gender: Gender | null;
  role: RegisterPublicRole | "";
  preferredRecitation: RecitationReading | null;
}

/**
 * RegisterForm — client component for the `/register` route.
 *
 * Layout: wide 2-column grid sitting directly on the auth layout's form
 * panel (NO Card wrapper). Fields are arranged in a 2-column grid
 * (`xs: 1fr`, `sm: 1fr 1fr`): fullName + email row 1, phone + country
 * row 2, password full-width row 3 (its strength meter renders
 * beneath it), then gender, then role full-width, recitation selector
 * full-width. Section dividers group the fields into "Account
 * Information" and "Preferences".
 *
 * State: React Hook Form owns the inputs (`register` + `Controller`) so a
 * single `setError(field, { message })` sink serves BOTH validation tiers
 * (dev3-002 Task 4.3):
 *  - Client tier: `auth`-namespace rules on every field (existing keys only
 *    — REQ-055), revalidated on change after submit ⇒ errors clear-on-fix.
 *  - Server tier: on mutation failure the raw Apollo error runs through
 *    `projectMutationFieldErrors` (the 4.1 REQ-061 table re-entered with
 *    `hasForm:true`); returned `extensions.fields[]` pairs are whitelisted
 *    through {@link isRegisterFieldPath} and applied via
 *    `applyProjectedFieldErrors`. When pairs were applied the global alert
 *    stays suppressed — per-field mapping REPLACES the fallback copy
 *    (REQ-061); otherwise the pre-existing code branches render unchanged
 *    (CONFLICT → `emailAlreadyExists`, VALIDATION → localized wire message,
 *    else → `registrationFailed`).
 *
 * Fields: fullName, email, phone, password, gender (optional), country,
 * role (Student / Teacher / Parent — NO Admin, enforced by the
 * `RegisterPublicRole` GraphQL enum at the schema layer; BFLA defense).
 *
 * Uses `useMutation(registerUserMutationDocument)`. On success: redirect to
 * `/login` (registration does NOT issue a token — the user must sign in to
 * authenticate).
 *
 * MUI v9 patterns: `sx` only, `*Outlined` icons, `React.SubmitEvent`
 * compatible handler, theme palette colors (no hardcoded hex).
 */
export function RegisterForm() {
  const t = useAppTranslation(Auth);
  const tRecitation = useAppTranslation(Recitation);
  const router = useRouter();

  // DEV1-003: fetch the canonical recitation-reading catalog (public query,
  // no auth required). Used to populate the selector dropdown.
  const { data: recitationData, loading: recitationLoading } = useQuery(recitationReadingsQueryDocument);
  const recitationOptions = recitationData?.recitationReadings ?? [];

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<RegisterFormValues>({
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      country: "",
      gender: null,
      role: "",
      preferredRecitation: null,
    },
  });

  // Compiler-safe value tracking (IMPLEMENTATION_LEARNINGS §7: useWatch, not watch()).
  const passwordValue = useWatch({ control, name: "password", defaultValue: "" });
  const roleValue = useWatch({ control, name: "role", defaultValue: "" });

  // Select-field controllers. Their `.value` degrades to `string` under tsgo,
  // so each select pins its value back through the pure *FromSelectValue
  // tables above instead of trusting the raw field value.
  const genderField = useController<RegisterFormValues, "gender">({
    control,
    name: "gender",
    defaultValue: null,
  });
  const roleField = useController<RegisterFormValues, "role">({
    control,
    name: "role",
    rules: { required: t.roleRequired },
    defaultValue: "",
  });
  const preferredRecitationField = useController<RegisterFormValues, "preferredRecitation">({
    control,
    name: "preferredRecitation",
    defaultValue: null,
  });

  // Pin the checker-degraded string values back to their GraphQL unions via
  // the pure *FromSelectValue tables (assertion-free both directions).
  const selectedGender: Gender | "" =
    typeof genderField.field.value === "string" ? (genderFromSelectValue(genderField.field.value) ?? "") : "";
  const selectedRole: RegisterPublicRole | "" =
    typeof roleField.field.value === "string" ? roleFromSelectValue(roleField.field.value) : "";
  // Catalog values come straight from the typed GraphQL query result — the
  // same Record-lookup trick keyed by their own wire strings keeps the
  // degraded comparison enum-safe without any assertion.
  const recitationByValue: Record<string, RecitationReading> = {};
  for (const reading of recitationOptions) {
    recitationByValue[reading] = reading;
  }
  const selectedRecitation: RecitationReading | "" =
    typeof preferredRecitationField.field.value === "string"
      ? (recitationByValue[preferredRecitationField.field.value] ?? "")
      : "";

  const [registerMutation, { loading }] = useMutation(registerUserMutationDocument);

  const onSubmit = useCallback(
    async (data: RegisterFormValues) => {
      setErrorMessage(null);

      // Unreachable while the required role rule holds; keeps `data.role`
      // narrowed to the `RegisterPublicRole` union for the variables below.
      if (!data.role) return;

      try {
        await registerMutation({
          variables: {
            input: {
              fullName: data.fullName.trim(),
              email: data.email.trim(),
              phone: data.phone.trim(),
              password: data.password,
              gender: data.gender,
              country: data.country.trim(),
              role: data.role,
              // DEV1-003: pass the optional preferredRecitation (null when no selection).
              // C.5 guardrail: NOT persisted to `recitation` — contract metadata only.
              preferredRecitation: data.preferredRecitation,
            },
          },
        });
        // Show a brief success message before redirecting to /login.
        setSuccessMessage(t.registrationSuccess);
        setTimeout(() => router.push("/login"), 1500);
      } catch (err) {
        // Server tier FIRST: project extensions.fields[] into RHF pairs via
        // the REQ-061 mapping (hasForm:true direct call — the app-scope
        // listener seam is left untouched). Unknown wire paths skipped.
        const projected = projectMutationFieldErrors(err);
        const applied = applyProjectedFieldErrors(projected, isRegisterFieldPath, (field, errorOptions) =>
          setError(field, { type: "server", message: errorOptions.message })
        );
        if (applied > 0) return; // per-field mapping REPLACES the global fallback (REQ-061)

        const code = extractErrorCode(err);
        if (code === "CONFLICT") {
          setErrorMessage(t.emailAlreadyExists);
        } else if (code === "VALIDATION") {
          // Surface the server-side validation message (already localized
          // by `getServerTranslations(locale).authTranslations` on the backend).
          const msg = extractErrorMessage(err);
          setErrorMessage(msg ?? t.registrationFailed);
        } else {
          setErrorMessage(t.registrationFailed);
        }
      }
    },
    [registerMutation, router, setError, t]
  );

  // Show password helper only when the user has typed something too short.
  const passwordTooShort = passwordValue.length > 0 && passwordValue.length < MIN_PASSWORD_LENGTH;

  // Render the role helper text for the currently-selected role.
  const roleHelperText = getRoleHelperText(roleValue, t);

  return (
    <Box sx={{ width: "100%", maxWidth: { xs: 560, md: 640 } }}>
      {/* === Header === */}
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme => `0 6px 16px ${theme.palette.secondary.main}33`,
              flexShrink: 0,
            }}
          >
            <PersonAddIcon sx={{ fontSize: 22 }} />
          </Box>
          <Stack spacing={0.25}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {t.registerTitle}
            </Typography>
            <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)" }}>
              {t.registerSubtitle}
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* === Section 1: Account Information === */}
        <SectionLabel>{t.accountInfoSection}</SectionLabel>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <TextField
            {...register("fullName", { required: t.nameRequired })}
            label={t.fullName}
            required
            fullWidth
            autoComplete="name"
            autoFocus
            error={Boolean(errors.fullName)}
            helperText={errors.fullName?.message ?? " "}
            aria-invalid={Boolean(errors.fullName)}
            slotProps={{
              input: {
                startAdornment: (
                  <PersonIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                ),
              },
              // audit-R4: error text arrives without moving focus (RHF's
              // ref lands on the wrapper), so the helper node itself must be
              // a polite live region for SR announcement.
              formHelperText: { "aria-live": "polite" },
            }}
          />
          <TextField
            {...register("email", {
              required: t.emailRequired,
              validate: value => (isValidEmailShape(value) ? true : t.emailInvalid),
            })}
            label={t.email}
            type="email"
            required
            fullWidth
            autoComplete="email"
            error={Boolean(errors.email)}
            helperText={errors.email?.message ?? " "}
            aria-invalid={Boolean(errors.email)}
            slotProps={{
              input: {
                startAdornment: (
                  <EmailIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                ),
              },
              formHelperText: { "aria-live": "polite" },
            }}
          />
          <TextField
            {...register("phone", { required: t.phoneRequired })}
            label={t.phone}
            type="tel"
            required
            fullWidth
            autoComplete="tel"
            error={Boolean(errors.phone)}
            helperText={errors.phone?.message ?? " "}
            aria-invalid={Boolean(errors.phone)}
            slotProps={{
              input: {
                startAdornment: (
                  <PhoneIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                ),
              },
              formHelperText: { "aria-live": "polite" },
            }}
          />
          <TextField
            {...register("country", { required: t.countryRequired })}
            label={t.country}
            required
            fullWidth
            autoComplete="country-name"
            error={Boolean(errors.country)}
            helperText={errors.country?.message ?? " "}
            aria-invalid={Boolean(errors.country)}
            slotProps={{
              input: {
                startAdornment: (
                  <PublicIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                ),
              },
              formHelperText: { "aria-live": "polite" },
            }}
          />
          {/* Password holds its own full-width grid row so the strength
              meter (remote visual, reconciled onto the register() contract)
              sits flush under the field instead of a squeezed half-cell. */}
          <Box sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}>
            <TextField
              {...register("password", {
                required: t.passwordRequired,
                minLength: { value: MIN_PASSWORD_LENGTH, message: t.passwordTooShort },
              })}
              label={t.password}
              type={showPassword ? "text" : "password"}
              required
              fullWidth
              autoComplete="new-password"
              helperText={errors.password?.message ?? (passwordTooShort ? t.passwordTooShort : " ")}
              error={Boolean(errors.password) || passwordTooShort}
              aria-invalid={Boolean(errors.password) || passwordTooShort}
              slotProps={{
                input: {
                  startAdornment: (
                    <LockIcon fontSize="small" sx={{ mr: 1, color: "var(--mui-palette-action-active)" }} />
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <MuiIconButton
                        aria-label={showPassword ? t.hidePassword : t.showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                        // audit-R4: v9 ButtonBase has no focus ring — this toggle
                        // was invisible to keyboard users when focused.
                        sx={focusVisibleRingSx}
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </MuiIconButton>
                    </InputAdornment>
                  ),
                },
                formHelperText: { "aria-live": "polite" },
              }}
            />
            <PasswordStrengthMeter pw={passwordValue} t={t} />
          </Box>
          <FormControl fullWidth error={Boolean(errors.gender)}>
            <InputLabel>{t.gender}</InputLabel>
            <Select<Gender | "">
              label={t.gender}
              name={genderField.field.name}
              inputRef={genderField.field.ref}
              onBlur={genderField.field.onBlur}
              value={selectedGender}
              onChange={event => genderField.field.onChange(genderFromSelectValue(event.target.value))}
            >
              <MenuItem value="Male">{t.genderMale}</MenuItem>
              <MenuItem value="Female">{t.genderFemale}</MenuItem>
              <MenuItem value="Other">{t.genderOther}</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* === Section 2: Preferences === */}
        <SectionLabel>{t.preferencesSection}</SectionLabel>
        <Stack spacing={2}>
          <FormControl fullWidth required error={Boolean(errors.role)}>
            <InputLabel>{t.role}</InputLabel>
            <Select<RegisterPublicRole | "">
              label={t.role}
              name={roleField.field.name}
              inputRef={roleField.field.ref}
              onBlur={roleField.field.onBlur}
              value={selectedRole}
              onChange={event => roleField.field.onChange(roleFromSelectValue(event.target.value))}
              // audit-R4: wire the error-helper id explicitly so SR users get
              // the message when the select is focused (see helper below).
              aria-describedby={getRoleSelectDescribedBy(Boolean(errors.role))}
            >
              <MenuItem value="Student">{t.roleStudent}</MenuItem>
              <MenuItem value="Teacher">{t.roleTeacher}</MenuItem>
              <MenuItem value="Parent">{t.roleParent}</MenuItem>
            </Select>
            {/* audit-R7/P2: explicit taller line-height so two-line helper
                copy (Arabic role descriptions) keeps legible line boxes. */}
            {errors.role ? (
              <FormHelperText error id="register-role-error-helper" aria-live="polite" sx={helperTextSx}>
                {errors.role.message}
              </FormHelperText>
            ) : null}
            {!errors.role && roleHelperText ? (
              <FormHelperText id="register-role-help" aria-live="polite" sx={helperTextSx}>
                {roleHelperText}
              </FormHelperText>
            ) : null}
          </FormControl>

          {/* DEV1-003: Recitation reading (Qira'ah) selector — premium card grid.
              C.5 guardrail: NOT persisted to `recitation` table (session-linked). */}
          <Box>
            {/* audit-R4: variant=subtitle2 defaulted to an <h6> element — a
                level-6 heading stranded mid-form (1→6 jump). Same look, no
                false outline entry. */}
            <Typography
              component="p"
              variant="subtitle2"
              sx={{ mb: 1, fontWeight: 600, color: "var(--mui-palette-text-primary)" }}
            >
              {tRecitation.selectTitle}
            </Typography>
            <RecitationSelector
              value={selectedRecitation}
              onChange={reading => preferredRecitationField.field.onChange(reading)}
              labels={tRecitation}
              options={recitationOptions}
              loading={recitationLoading}
            />
            <FormHelperText sx={[{ mt: 1 }, helperTextSx]}>{tRecitation.selectHelper}</FormHelperText>
          </Box>

          {errorMessage ? (
            // audit-R7/P1: same radius token as the floating host toast that
            // accompanies this surface on masked failures.
            <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>
              {errorMessage}
            </Alert>
          ) : null}

          {successMessage ? (
            <Alert severity="success" variant="filled" icon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
              {successMessage}
            </Alert>
          ) : null}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading || isSubmitting || successMessage !== null}
            startIcon={loading || isSubmitting ? <CircularProgress size={20} sx={{ color: "inherit" }} /> : null}
            sx={{
              py: 1.5,
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 2,
              textTransform: "none",
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
              boxShadow: theme => `0 6px 16px ${theme.palette.secondary.main}33`,
              // audit-R4: v9 ButtonBase ships no keyboard-focus style; the
              // primary submit was invisible when tabbed to.
              "&.Mui-focusVisible": {
                outline: "2px solid",
                outlineColor: "var(--mui-palette-secondary-main)",
                outlineOffset: 2,
              },
              "&:hover": {
                bgcolor: "var(--mui-palette-secondary-dark)",
                boxShadow: theme => `0 8px 20px ${theme.palette.secondary.main}44`,
                transform: "translateY(-1px)",
              },
              transition: "box-shadow 0.15s ease, transform 0.15s ease, background-color 0.15s ease",
              ...reducedMotionSx,
            }}
          >
            {t.submit}
          </Button>
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} sx={{ justifyContent: "center", mt: 3 }}>
        <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)" }}>
          {t.haveAccount}
        </Typography>
        <MuiLink component={Link} href="/login" underline="hover" sx={{ fontWeight: 600 }}>
          {t.loginLink}
        </MuiLink>
      </Stack>
    </Box>
  );
}

/**
 * Small uppercase section label with a copper accent rule. Used to group
 * the form fields into "Account Information" / "Preferences" sections.
 */
function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "center",
        mb: 2,
      }}
    >
      <Box
        sx={{
          width: 4,
          height: 18,
          borderRadius: 1,
          bgcolor: "var(--mui-palette-secondary-main)",
          flexShrink: 0,
        }}
        aria-hidden
      />
      {/* audit-R7/P2: latin-tracked overline spacing reads broken on Arabic
          script — collapse tracking to 0 whenever the document lang is ar. */}
      <Typography
        variant="overline"
        sx={{
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "var(--mui-palette-text-secondary)",
          lineHeight: 1,
          'html[lang="ar"] &': {
            letterSpacing: 0,
          },
        }}
      >
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Maps the currently-selected role to its translated helper text.
 *
 * Written as a switch (not a nested ternary) so `sonarjs/no-nested-conditional`
 * stays green — the role union has 4 cases and the ternary chain would nest
 * three levels deep.
 */
function getRoleHelperText(role: RegisterPublicRole | "", t: AuthLabels): string {
  switch (role) {
    case RegisterPublicRole.Student:
      return t.roleStudentHelper;
    case RegisterPublicRole.Teacher:
      return t.roleTeacherHelper;
    case RegisterPublicRole.Parent:
      return t.roleParentHelper;
    default:
      return "";
  }
}

/**
 * Four-segment password-strength meter (remote visual) rendered beneath the
 * RHF-registered password field. Hidden while the field is empty; consumes
 * the watched value through {@link getPasswordStrength} so labels stay
 * localized and colors stay on palette tokens.
 */
function PasswordStrengthMeter({ pw, t }: { readonly pw: string; readonly t: AuthLabels }) {
  if (pw.length === 0) return null;
  const { score, label, color } = getPasswordStrength(pw, t);
  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
        {[1, 2, 3, 4].map(level => (
          <Box
            key={level}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              bgcolor: score >= level ? color : "var(--mui-palette-divider)",
              transition: "background-color 0.3s ease",
              "@media (prefers-reduced-motion: reduce)": {
                transition: "none",
              },
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ color, fontWeight: 600, fontSize: 12 }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Maps the role-select error state to the id of its helper node.
 *
 * Extracted (audit-R4) so the component body's cognitive complexity stays
 * inside the sonar budget while the aria-describedby link stays explicit —
 * FormControl's auto-link does not reach manual Select compositions in v9.
 */
function getRoleSelectDescribedBy(hasRoleError: boolean): string | undefined {
  return hasRoleError ? "register-role-error-helper" : undefined;
}

/**
 * Evaluates password strength based on length, character diversity, and
 * special characters. Returns a 0–4 score, a translated label, and an
 * MUI palette color token for the strength meter bars.
 */
function getPasswordStrength(pw: string, t: AuthLabels): { score: number; label: string; color: string } {
  // Defensive empty-input arm (PasswordStrengthMeter hides itself while the
  // field is empty); still resolves through a theme token, never a color name.
  if (pw.length === 0) return { score: 0, label: "", color: "var(--mui-palette-divider)" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // CSS custom-property names use DASHES (`--mui-palette-error-main`), never
  // dots — the dotted forms below resolved to empty values and rendered the
  // meter bars transparent with an inherited (non-token) label color.
  if (score <= 1) return { score: 1, label: t.passwordStrengthWeak, color: "var(--mui-palette-error-main)" };
  if (score <= 2) return { score: 2, label: t.passwordStrengthFair, color: "var(--mui-palette-warning-main)" };
  if (score <= 3) return { score: 3, label: t.passwordStrengthGood, color: "var(--mui-palette-info-main)" };
  return { score: 4, label: t.passwordStrengthStrong, color: "var(--mui-palette-success-main)" };
}
