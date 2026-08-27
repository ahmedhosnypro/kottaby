import { alpha, type Components, type Theme } from "@mui/material/styles";

/**
 * CSS-variable-based autofill color tokens.
 *
 * With `cssVariables: true`, MUI bakes a single stylesheet that serves both
 * light and dark modes. Literal hex strings baked at theme creation time (the
 * previous approach) locked autofill colors to the *default* color scheme,
 * so switching to a non-default mode mismatched the palette and browser
 * autofill themes reappeared. Using CSS variable references lets the browser
 * resolve autofill colors at runtime per the active color scheme.
 *
 * Background: matches the surface behind the input (transparent inputs sit on
 * either background.default or background.paper); we use surface because it is
 * the elevated card surface where form inputs live.
 * Text: matches the primary text color.
 */
const AUTOFILL_BACKGROUND_VAR = "var(--mui-palette-surface, var(--mui-palette-background-default))";
const AUTOFILL_TEXT_VAR = "var(--mui-palette-text-primary)";

/**
 * MD3 switch geometry (material-web md-comp-switch), scaled ~0.7 for dense UI.
 * Spec medium is 52×32 / thumbs 16→24; we use 36×22 / 10→16 so tables stay readable.
 */
const MD3_SWITCH = {
  trackWidth: 36,
  trackHeight: 22,
  trackOutlineWidth: 2,
  unselectedThumb: 10,
  selectedThumb: 16,
  pressedThumb: 20,
  /** (trackHeight - unselectedThumb) / 2 */
  unselectedMargin: 6,
  /** (trackHeight - selectedThumb) / 2 */
  selectedMargin: 3,
  /** Leading-edge offset so selected thumb sits with selectedMargin inset. */
  checkedTranslateX: 14,
  small: {
    trackWidth: 28,
    trackHeight: 18,
    unselectedThumb: 8,
    selectedThumb: 12,
    pressedThumb: 16,
    unselectedMargin: 5,
    selectedMargin: 3,
    checkedTranslateX: 10,
  },
} as const;

type SwitchPaletteColor = "primary" | "secondary" | "error" | "info" | "success" | "warning";

const SWITCH_ON_COLORS: Record<
  SwitchPaletteColor,
  "onPrimary" | "onSecondary" | "onError" | "onInfo" | "onSuccess" | "onWarning"
> = {
  primary: "onPrimary",
  secondary: "onSecondary",
  error: "onError",
  info: "onInfo",
  success: "onSuccess",
  warning: "onWarning",
};

const isSwitchPaletteColor = (color: string): color is SwitchPaletteColor => Object.hasOwn(SWITCH_ON_COLORS, color);

const getSwitchOnColor = (theme: Theme, color: string | undefined): string => {
  if (color && isSwitchPaletteColor(color)) {
    return theme.palette[SWITCH_ON_COLORS[color]];
  }
  return theme.palette.onPrimary;
};

const getSwitchMainColor = (theme: Theme, color: string | undefined): string => {
  if (color && isSwitchPaletteColor(color)) {
    return theme.palette[color].main;
  }
  return theme.palette.primary.main;
};

const getMuiCssBaseline = (): Components<Omit<Theme, "components">>["MuiCssBaseline"] => ({
  styleOverrides: {
    body: {
      backgroundColor: "var(--mui-palette-background-default)",
      color: "var(--mui-palette-onBackground)",
    },
    /**
     * Autofill rules use CSS variable references so the browser resolves the
     * correct colors at runtime for the active color scheme. Hardcoded literals
     * baked at theme creation time only matched the default scheme, causing
     * mismatched autofill styling when the user switched modes.
     */
    "input:-webkit-autofill": {
      WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
      caretColor: `${AUTOFILL_TEXT_VAR} !important`,
      borderRadius: "inherit",
      transition: "background-color 5000s ease-in-out 0s",
    },
    "input:-webkit-autofill:hover": {
      WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
    },
    "input:-webkit-autofill:focus": {
      WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
    },
    "input:-webkit-autofill:active": {
      WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
    },
    "textarea:-webkit-autofill, select:-webkit-autofill": {
      WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
      caretColor: `${AUTOFILL_TEXT_VAR} !important`,
      borderRadius: "inherit",
      transition: "background-color 5000s ease-in-out 0s",
    },
    "input:autofill, textarea:autofill, select:autofill": {
      boxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
      color: `${AUTOFILL_TEXT_VAR} !important`,
    },
    "input:-internal-autofill-selected": {
      backgroundColor: `${AUTOFILL_BACKGROUND_VAR} !important`,
      backgroundImage: "none !important",
      color: `${AUTOFILL_TEXT_VAR} !important`,
    },
    "input[data-com-onepassword-filled], textarea[data-com-onepassword-filled], input[data-com-onepassword-filled='dark'], textarea[data-com-onepassword-filled='dark']":
      {
        backgroundColor: `${AUTOFILL_BACKGROUND_VAR} !important`,
        WebkitBoxShadow: `0 0 0 1000px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        color: `${AUTOFILL_TEXT_VAR} !important`,
        caretColor: `${AUTOFILL_TEXT_VAR} !important`,
      },
    "*::-webkit-scrollbar": {
      width: "6px",
      backgroundColor: "transparent",
    },
    "*::-webkit-scrollbar-track": {
      background: "color-mix(in srgb, var(--mui-palette-onBackground) 2%, transparent)",
      borderRadius: "6px",
      margin: "4px 0",
    },
    "*::-webkit-scrollbar-thumb": {
      background: "color-mix(in srgb, var(--mui-palette-onBackground) 15%, transparent)",
      borderRadius: "6px",
      border: "2px solid var(--mui-palette-background-default)",
    },
    "*::-webkit-scrollbar-thumb:hover": {
      background: "color-mix(in srgb, var(--mui-palette-onBackground) 25%, transparent)",
    },
    "*": {
      scrollbarWidth: "thin",
      scrollbarColor:
        "color-mix(in srgb, var(--mui-palette-onBackground) 15%, transparent) color-mix(in srgb, var(--mui-palette-onBackground) 2%, transparent)",
    },
  },
});

const getMuiButton = (): Components<Omit<Theme, "components">>["MuiButton"] => ({
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      borderRadius: 8, // Rounded buttons
      boxShadow: "none",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      "&:hover": {
        boxShadow: "none",
      },
      ...(ownerState.variant === "contained" &&
        ownerState.color === "primary" && {
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.onPrimary,
          "&:hover": {
            backgroundColor: theme.palette.primary.dark,
            boxShadow: "none",
          },
        }),
    }),
  },
});

const getMuiPaper = (): Components<Omit<Theme, "components">>["MuiPaper"] => ({
  styleOverrides: {
    root: {
      backgroundImage: "none",
    },
  },
});

const getMuiCard = (): Components<Omit<Theme, "components">>["MuiCard"] => ({
  styleOverrides: {
    root: ({ theme }) => ({
      borderRadius: 8, // Data containers use modern rounded-xl (1rem/16px) standard
      boxShadow: theme.palette.shadow.card,
      border: `1px solid ${theme.palette.border.light}`,
      backgroundColor: theme.palette.background.paper,
    }),
  },
});

const getMuiInputOverrides = () => ({
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        "& input:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
          borderRadius: "inherit",
          transition: "background-color 5000s ease-in-out 0s",
        },
        "& input:-webkit-autofill:hover": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "& input:-webkit-autofill:focus": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "& input:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
      },
      input: {
        "&:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
          borderRadius: "inherit",
        },
        "&:-webkit-autofill:hover": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
        "&:-webkit-autofill:focus": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
        "&:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
      },
    },
  },
  MuiInputBase: {
    styleOverrides: {
      input: {
        "&:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "&:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
      },
    },
  },
});

const getMuiDataGrid = (): Components<Omit<Theme, "components">>["MuiDataGrid"] => ({
  styleOverrides: {
    root: ({ theme }) => ({
      border: "none",
      "--DataGrid-containerBackground": "transparent",
      "& .MuiDataGrid-columnHeader": {
        backgroundColor: theme.palette.surfaceContainerLow,
      },
      "& .MuiDataGrid-columnHeaderTitle": {
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: theme.palette.onSurfaceVariant,
      },
      // Cells default to display:block; without flex, plain text sticks to the top
      // while taller renderCell content (avatars, icon buttons) sits mid-row.
      "& .MuiDataGrid-cell": {
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid`,
        borderColor: theme.palette.border.light,
      },
      "& .MuiDataGrid-row:hover": {
        backgroundColor:
          theme.palette.mode === "light"
            ? alpha(theme.palette.primary.main, 0.04)
            : alpha(theme.palette.primary.main, 0.06),
      },
      "& .MuiDataGrid-footerContainer": {
        borderTop: `1px solid`,
        borderColor: theme.palette.border.light,
      },
    }),
  },
});

type SwitchGeo = typeof MD3_SWITCH | typeof MD3_SWITCH.small;

/** SwitchBase interaction states: hover, focus, active, checked, disabled. */
const getSwitchBaseStyles = (theme: Theme, geo: SwitchGeo, main: string, onColor: string): Record<string, unknown> => ({
  padding: 0,
  margin: geo.unselectedMargin,
  color: theme.palette.outline,
  transition: theme.transitions.create(["transform", "margin", "color"], {
    duration: theme.transitions.duration.shortest,
  }),
  "&:hover": {
    backgroundColor: theme.alpha(theme.palette.onSurface, theme.palette.action.hoverOpacity),
    "@media (hover: none)": {
      backgroundColor: "transparent",
    },
  },
  "&.Mui-focusVisible": {
    backgroundColor: theme.alpha(theme.palette.onSurface, theme.palette.action.focusOpacity),
  },
  "&:active .MuiSwitch-thumb": {
    width: geo.pressedThumb,
    height: geo.pressedThumb,
  },
  "&.Mui-checked": {
    transform: `translateX(${geo.checkedTranslateX}px)`,
    margin: geo.selectedMargin,
    color: onColor,
    "&:hover": {
      backgroundColor: theme.alpha(main, theme.palette.action.hoverOpacity),
      "@media (hover: none)": {
        backgroundColor: "transparent",
      },
    },
    "&.Mui-focusVisible": {
      backgroundColor: theme.alpha(main, theme.palette.action.focusOpacity),
    },
    "& .MuiSwitch-thumb": {
      width: geo.selectedThumb,
      height: geo.selectedThumb,
    },
    "& + .MuiSwitch-track": {
      opacity: 1,
      backgroundColor: main,
      borderColor: main,
    },
  },
  "&.Mui-checked.Mui-disabled": {
    color: theme.palette.surface,
    "& .MuiSwitch-thumb": {
      opacity: 1,
    },
    "& + .MuiSwitch-track": {
      opacity: 0.12,
      backgroundColor: theme.palette.onSurface,
      borderColor: theme.palette.onSurface,
    },
  },
  "&.Mui-disabled": {
    color: theme.palette.onSurface,
    "& .MuiSwitch-thumb": {
      opacity: 0.38,
    },
    "& + .MuiSwitch-track": {
      opacity: 0.12,
      backgroundColor: theme.palette.surfaceContainerHighest,
      borderColor: theme.palette.onSurface,
    },
  },
});

/** Thumb element geometry and transition for unselected state. */
const getSwitchThumbStyles = (geo: SwitchGeo): Record<string, unknown> => ({
  width: geo.unselectedThumb,
  height: geo.unselectedThumb,
  boxShadow: "none",
  border: "none",
  transition: "width 100ms ease, height 100ms ease",
});

/** Track element base appearance: outlined outline when off. */
const getSwitchTrackStyles = (theme: Theme, geo: SwitchGeo): Record<string, unknown> => ({
  borderRadius: geo.trackHeight / 2,
  opacity: 1,
  backgroundColor: theme.palette.surfaceContainerHighest,
  border: `${MD3_SWITCH.trackOutlineWidth}px solid ${theme.palette.outline}`,
  boxSizing: "border-box",
});

/**
 * Restyles MUI's MD2 Switch to Material Design 3 geometry and color roles.
 *
 * Spec roles (material-web md-comp-switch), denser geometry for app UI:
 * - Track outlined when off, filled with color.main when on
 * - Thumb grows when selected; color = outline (off) / on<Color> (on)
 * - Disabled: track opacity 0.12, thumb opacity 0.38
 */
const getMuiSwitch = (): Components<Omit<Theme, "components">>["MuiSwitch"] => ({
  defaultProps: {
    disableRipple: true,
  },
  styleOverrides: {
    // Color/state rules live on `root` so nested selectors beat MUI's
    // per-color SwitchBase variants (which still paint MD2 `*.main` thumbs).
    root: ({ theme, ownerState }) => {
      const geo = ownerState.size === "small" ? MD3_SWITCH.small : MD3_SWITCH;
      const main = getSwitchMainColor(theme, ownerState.color);
      const onColor = getSwitchOnColor(theme, ownerState.color);

      return {
        width: geo.trackWidth,
        height: geo.trackHeight,
        padding: 0,
        overflow: "hidden",
        "& .MuiSwitch-switchBase": getSwitchBaseStyles(theme, geo, main, onColor),
        "& .MuiSwitch-thumb": getSwitchThumbStyles(geo),
        "& .MuiSwitch-track": getSwitchTrackStyles(theme, geo),
      };
    },
  },
});

/**
 * Custom typography variants default to `<span>` without a mapping, which makes
 * consecutive titles/subtitles render inline and overlap. Map every text-like
 * variant to a block element. Inline-only variants (button / buttonText /
 * labelSm / overline) stay as `span`. Pair with `display: "block"` on the
 * matching entries in `typography.ts` so styled wrappers stay stacked too.
 */
const getMuiTypography = (): Components<Omit<Theme, "components">>["MuiTypography"] => ({
  defaultProps: {
    variantMapping: {
      // Built-in
      h1: "h1",
      h2: "h2",
      h3: "h3",
      h4: "h4",
      h5: "h5",
      h6: "h6",
      subtitle1: "h6",
      subtitle2: "h6",
      body1: "p",
      body2: "p",
      inherit: "p",
      caption: "p",
      overline: "span",
      button: "span",
      // Design-system
      display: "h1",
      headlineLg: "h2",
      headlineMd: "h3",
      titleLg: "h4",
      bodyLg: "p",
      bodyMd: "p",
      labelMd: "p",
      labelSm: "span",
      labelUppercase: "p",
      buttonText: "span",
    },
  },
});

export const components = (): Components<Omit<Theme, "components">> => {
  return {
    MuiCssBaseline: getMuiCssBaseline(),
    MuiButton: getMuiButton(),
    MuiPaper: getMuiPaper(),
    MuiCard: getMuiCard(),
    MuiSwitch: getMuiSwitch(),
    MuiTypography: getMuiTypography(),
    ...getMuiInputOverrides(),
    MuiDataGrid: getMuiDataGrid(),
  };
};
