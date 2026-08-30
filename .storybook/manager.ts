import { MoonIcon, SunIcon } from "@storybook/icons";
import { createElement as h, memo, useCallback, useEffect, useState } from "react";
import { ToggleButton } from "storybook/internal/components";
import { addons, types } from "storybook/manager-api";
import { themes } from "storybook/theming";

type UiThemeMode = "light" | "dark";

const UI_THEME_STORAGE_KEY = "sb-ui-theme";
const UI_THEME_TOOL_ID = "ui-theme-toggle";

function getStoredMode(): UiThemeMode | null {
  const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function getOsMode(): UiThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyUiTheme(mode: UiThemeMode): void {
  addons.setConfig({ theme: mode === "dark" ? themes.dark : themes.light });
}

// No forced dark mode: use the stored choice, otherwise follow the OS preference.
applyUiTheme(getStoredMode() ?? getOsMode());

// Note: this file intentionally avoids JSX — the manager builder compiles with the
// classic JSX runtime, which requires a live `React` binding that linters can
// mistake for an unused import and strip.
const UiThemeToggle = memo(function UiThemeToggle() {
  const [mode, setMode] = useState<UiThemeMode>(getStoredMode() ?? getOsMode());

  // Keep following OS changes live until the user picks a mode manually.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = (event: MediaQueryListEvent) => {
      if (getStoredMode()) {
        return;
      }
      setMode(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onOsChange);
    return () => media.removeEventListener("change", onOsChange);
  }, []);

  useEffect(() => {
    applyUiTheme(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    // Persist in the event handler, NOT inside a state updater — Strict Mode
    // may invoke updaters twice; localStorage writes must stay outside them.
    const next: UiThemeMode = mode === "dark" ? "light" : "dark";
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, next);
    setMode(next);
  }, [mode]);

  return h(
    ToggleButton,
    {
      ariaLabel: "Toggle light and dark UI theme",
      onClick: toggle,
      padding: "small",
      pressed: mode === "dark",
      title: "Toggle UI theme",
      tooltip: `UI theme: ${mode} — click to switch`,
      variant: "ghost",
    },
    h(mode === "dark" ? MoonIcon : SunIcon)
  );
});

addons.register(UI_THEME_TOOL_ID, () => {
  addons.add(UI_THEME_TOOL_ID, {
    type: types.TOOL,
    title: "Toggle UI theme",
    render: () => h(UiThemeToggle),
  });
});
