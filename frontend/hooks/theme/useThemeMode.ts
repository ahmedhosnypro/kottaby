"use client";

import { useContext } from "react";
import { ThemeContext } from "@/frontend/context/ThemeContext";

/** Backward-compat default — no-op state setter. */
const defaultSetIsThemeChanging = () => {};

/** Backward-compat default — theme is not in a transitioning state. */
const defaultIsThemeChanging = false;

/**
 * Read the application theme mode + toggler.
 *
 * The mode source of truth has migrated from the legacy custom `useState` (in
 * the old `AppThemeProvider`) to MUI v9's stable `useColorScheme()` hook,
 * bridged into `ThemeContext` by `ColorSchemeStateBridge` inside the new
 * `AppThemeProvider`. Consumers keep the same `{ mode, toggleTheme,
 * isThemeChanging, setIsThemeChanging }` shape — no call sites change.
 */
export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within an AppThemeProvider");
  }

  // Provide default values for properties if they don't exist (backward compat).
  return {
    ...context,
    isThemeChanging: context.isThemeChanging ?? defaultIsThemeChanging,
    setIsThemeChanging: context.setIsThemeChanging ?? defaultSetIsThemeChanging,
  };
};
