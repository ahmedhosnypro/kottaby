# Known Fixes and Breaking Changes

When upgrading dependencies (e.g., React, Material UI, Next.js), breaking changes occur. Document any new patterns discovered while fixing `lint` and `tsgo` errors here so other agents can reuse them without investigating `node_modules` repeatedly. Keep it short and actionable.

## Example Issues & Resolutions

### 1. Material-UI Icons Rename

- **Error:** `error TS2724: '"@mui/icons-material"' has no exported member named 'ErrorOutline'.`
- **Cause:** Icon names with `Outline` were renamed to `Outlined` in newer MUI versions.
- **Fix:** Change `import { ErrorOutline } from '@mui/icons-material';` to `import { ErrorOutlined } from '@mui/icons-material';` and update the component usage.
- **Also applies to path imports:** e.g. `@mui/icons-material/CheckCircleOutline` → `@mui/icons-material/CheckCircleOutlined`.

### 2. Material-UI Typography fontWeight Prop

- **Error:** `Property 'fontWeight' does not exist on type...` for `<Typography>` components.
- **Cause:** Direct style props on Typography components might be restricted or require exact types (e.g., numbers vs strings) depending on the MUI v6 module augmentation.
- **Fix:** Move the prop into the `sx` prop: `<Typography sx={{ fontWeight: 'bold' }}>` OR ensure the correct type is used if still supported.

### 3. React 19 FormEvents

- **Error:** FormEvent type errors or deprecation warnings.
- **Cause:** `FormEvent` is deprecated/removed in React 19.
- **Fix:** Use `React.SubmitEvent` or `React.SyntheticEvent<HTMLFormElement>` as per `AGENTS.md`.

### 4. MUI X DatePicker `autoComplete` in `slotProps.textField`

- **Error:** `Object literal may only specify known properties, and 'autoComplete' does not exist in type ... PickersTextFieldProps`.
- **Cause:** In newer MUI X versions, `autoComplete` is not a direct `textField` slot prop.
- **Fix:** Set it via nested HTML input props: `slotProps={{ textField: { slotProps: { htmlInput: { autoComplete: "bday" } } } }}`.

### 5. Material-UI Stack Layout Props

- **Error:** `Property 'alignItems' does not exist on type...` or `Property 'justifyContent' does not exist on type...` for `<Stack>` components.
- **Cause:** Direct system style props on Stack may be restricted by the current MUI typings.
- **Fix:** Move layout props into `sx`: `<Stack sx={{ alignItems: "center", justifyContent: "space-between" }}>`.

### 6. Material-UI Spacing Props (mb, mt, etc.)

- **Error:** `Property 'mb' does not exist on type...` or `Property 'mt' does not exist on type...` for MUI components.
- **Cause:** Direct spacing props are restricted in newer MUI versions and must be in `sx`.
- **Fix:** Move spacing props into `sx`: `<Typography sx={{ mb: 1 }}>` or `<Grid sx={{ mt: 2 }}>` or `<Stack sx={{ mb: 4 }}>`.

### 7. MUI Autocomplete `inputProps` Removed from `AutocompleteRenderInputParams`

- **Error:** `Property 'inputProps' does not exist on type 'AutocompleteRenderInputParams'` and `Unsafe assignment of an 'any' value`.
- **Cause:** In newer MUI versions, `AutocompleteRenderInputParams` no longer exposes `inputProps` directly; it now uses `slotProps.htmlInput`.
- **Fix:** Replace `params.inputProps` with `params.slotProps.htmlInput` when spreading into `slotProps.htmlInput` of a `TextField`.
